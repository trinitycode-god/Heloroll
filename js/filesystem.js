/**
 * filesystem.js
 * Tudo relacionado à File System Access API:
 * - Selecionar a pasta raiz de animes
 * - Persistir/restaurar a permissão via IndexedDB
 * - Varrer recursivamente a árvore de pastas
 * - Ordenação natural de episódios (Episódio 2 antes de Episódio 10)
 *
 * Suporte: Chrome/Edge desktop. Safari e Firefox não implementam
 * showDirectoryPicker() no momento — tratamos isso graciosamente.
 */

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mkv', 'avi', 'mov', 'm4v'];
// Extensões que o <video> do navegador toca nativamente (sem garantias de codec interno)
const NATIVE_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'm4v']);

function isFileSystemAccessSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

function getFileExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isVideoFile(filename) {
  return VIDEO_EXTENSIONS.includes(getFileExtension(filename));
}

function isNativelyPlayable(filename) {
  return NATIVE_EXTENSIONS.has(getFileExtension(filename));
}

/**
 * Extrai o primeiro número "significativo" de um nome de arquivo/pasta,
 * usado tanto para ordenar episódios quanto para detectar números de temporada.
 */
function extractNumber(name) {
  const match = name.match(/(\d+([.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
}

/**
 * Comparador de ordenação natural — trata números embutidos no texto como
 * números, não como strings, então "Episódio 10" vem depois de "Episódio 2".
 */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function detectSeasonNumber(folderName) {
  const patterns = [
    /temporada\s*(\d+)/i,
    /season\s*(\d+)/i,
    /\bs(\d+)\b/i,
    /(\d+)\s*ª?\s*temporada/i
  ];
  for (const re of patterns) {
    const m = folderName.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Pede ao usuário para selecionar a pasta raiz (ex: D:\Animes) e salva
 * a referência (handle) no IndexedDB para tentar reconectar depois.
 */
async function pickRootFolder() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API não suportada neste navegador.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'read' });
  await db.saveFolderHandle(handle);
  return handle;
}

/**
 * Tenta recuperar o handle salvo e verificar/pedir permissão novamente,
 * como exigido pela especificação (permissões não persistem indefinidamente
 * sem confirmação do usuário).
 */
async function tryRestoreRootFolder() {
  if (!isFileSystemAccessSupported()) return null;
  const handle = await db.getFolderHandle();
  if (!handle) return null;

  const opts = { mode: 'read' };
  let permission = await handle.queryPermission(opts);
  if (permission === 'granted') return handle;

  // 'prompt' — precisamos de um gesto do usuário para chamar requestPermission,
  // então devolvemos o handle "pendente" e deixamos o app.js pedir confirmação.
  return { pendingHandle: handle };
}

async function requestPermissionFor(handle) {
  const opts = { mode: 'read' };
  const result = await handle.requestPermission(opts);
  return result === 'granted';
}

/**
 * Varre recursivamente a pasta raiz. Estrutura assumida:
 *   Raiz / NomeDoAnime / (arquivos de vídeo direto)                -> 1 temporada implícita
 *   Raiz / NomeDoAnime / NomeDaTemporada / (arquivos de vídeo)     -> múltiplas temporadas
 *
 * Retorna um array de objetos "anime" com temporadas e episódios,
 * cada episódio guardando o FileSystemFileHandle (não o arquivo em si,
 * que só é aberto quando o usuário manda reproduzir).
 */
async function scanLibrary(rootHandle, onProgress) {
  const animes = [];
  let animeCount = 0;

  for await (const [name, handle] of rootHandle.entries()) {
    if (handle.kind !== 'directory') continue;
    animeCount++;
    if (onProgress) onProgress(`Lendo "${name}"…`);

    const anime = await scanAnimeFolder(name, handle);
    if (anime.seasons.some(s => s.episodes.length > 0)) {
      animes.push(anime);
    }
  }

  animes.sort((a, b) => naturalCompare(a.name, b.name));
  for (const anime of animes) {
    anime.seasons.sort((a, b) => a.number - b.number);
    for (const season of anime.seasons) {
      season.episodes.sort((a, b) => naturalCompare(a.filename, b.filename));
      season.episodes.forEach((ep, idx) => { ep.index = idx + 1; });
    }
  }
  return animes;
}

async function scanAnimeFolder(animeName, animeHandle) {
  const directVideos = [];
  const subfolders = [];

  for await (const [name, handle] of animeHandle.entries()) {
    if (handle.kind === 'file' && isVideoFile(name)) {
      directVideos.push({ name, handle });
    } else if (handle.kind === 'directory') {
      subfolders.push({ name, handle });
    }
  }

  const seasons = [];

  if (directVideos.length > 0) {
    seasons.push(await buildSeason(animeName, 1, 'Temporada 01', directVideos));
  }

  for (const sub of subfolders) {
    const videos = [];
    // um nível de recursão extra, caso episódios estejam em sub-subpastas
    await collectVideosRecursively(sub.handle, videos);
    if (videos.length === 0) continue;
    const seasonNumber = detectSeasonNumber(sub.name) || (seasons.length + 1);
    seasons.push(await buildSeason(animeName, seasonNumber, sub.name, videos));
  }

  return {
    id: animeName,
    name: animeName,
    seasons,
    episodeCount: seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  };
}

async function collectVideosRecursively(dirHandle, out, depth = 0) {
  if (depth > 3) return; // limite de segurança
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && isVideoFile(name)) {
      out.push({ name, handle });
    } else if (handle.kind === 'directory') {
      await collectVideosRecursively(handle, out, depth + 1);
    }
  }
}

async function buildSeason(animeName, number, seasonName, videoEntries) {
  videoEntries.sort((a, b) => naturalCompare(a.name, b.name));
  const episodes = videoEntries.map((entry, idx) => {
    const num = extractNumber(entry.name);
    return {
      id: `s${number}-e${idx}-${entry.name}`,
      filename: entry.name,
      title: cleanEpisodeTitle(entry.name),
      episodeNumber: num !== null ? num : idx + 1,
      extension: getFileExtension(entry.name),
      nativelyPlayable: isNativelyPlayable(entry.name),
      handle: entry.handle
    };
  });
  return { number, name: seasonName, episodes };
}

function cleanEpisodeTitle(filename) {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[._]/g, ' ').trim();
}

/**
 * Compara uma varredura nova com os dados salvos e retorna um resumo
 * do que mudou, para exibir notificações e atualizar a interface.
 */
function diffLibrary(oldAnimes, newAnimes) {
  const oldMap = new Map(oldAnimes.map(a => [a.id, a]));
  const changes = { newAnimes: [], newEpisodes: [] };

  for (const anime of newAnimes) {
    const old = oldMap.get(anime.id);
    if (!old) {
      changes.newAnimes.push(anime.name);
      continue;
    }
    const oldEpisodeIds = new Set(
      old.seasons.flatMap(s => s.episodes.map(e => e.filename))
    );
    const newEpisodeCount = anime.seasons
      .flatMap(s => s.episodes)
      .filter(e => !oldEpisodeIds.has(e.filename)).length;
    if (newEpisodeCount > 0) {
      changes.newEpisodes.push({ anime: anime.name, count: newEpisodeCount });
    }
  }
  return changes;
}
