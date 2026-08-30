/**
 * anime-api.js
 * Busca metadados públicos (capa, sinopse, gêneros, ano, status) usando a
 * Jikan API (https://docs.api.jikan.moe), um wrapper gratuito e não-oficial
 * do MyAnimeList. Todos os resultados são cacheados no IndexedDB para não
 * repetir requisições e para respeitar o rate limit público da API
 * (aproximadamente 3 requisições/segundo, 60/minuto).
 */

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias
const DEFAULT_COVER = 'assets/images/default-cover.svg';

// Fila simples para não estourar o rate limit da Jikan quando há muitos animes.
class RequestQueue {
  constructor(minIntervalMs) {
    this.minInterval = minIntervalMs;
    this.lastRun = 0;
    this.queue = Promise.resolve();
  }
  add(fn) {
    this.queue = this.queue.then(async () => {
      const wait = Math.max(0, this.lastRun + this.minInterval - Date.now());
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this.lastRun = Date.now();
      return fn();
    });
    return this.queue;
  }
}
const jikanQueue = new RequestQueue(450);

/**
 * Limpa o nome da pasta para virar uma boa query de busca.
 * Remove coisas como "[Legendado]", "(Dublado)", anos entre parênteses, etc.
 */
function sanitizeSearchTerm(folderName) {
  return folderName
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[._]/g, ' ')
    .replace(/\b(legendado|dublado|dub|sub)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan API respondeu ${res.status}`);
  return res.json();
}

/**
 * Busca (ou recupera do cache) as informações públicas de um anime a partir
 * do nome da pasta. Retorna um objeto normalizado; nunca lança erro — em
 * caso de falha, devolve um "perfil" padrão para não travar a biblioteca.
 */
async function fetchAnimeMetadata(folderName) {
  const cacheKey = `anime:${folderName.toLowerCase()}`;
  const cached = await db.getCachedApiResult(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const query = sanitizeSearchTerm(folderName);
  let result = buildFallbackMetadata(folderName);

  if (query) {
    try {
      const data = await jikanQueue.add(() =>
        fetchJson(`${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=1&sfw=true`)
      );
      const best = data?.data?.[0];
      if (best) {
        result = {
          id: folderName,
          officialTitle: best.title || folderName,
          cover: best.images?.jpg?.large_image_url || best.images?.jpg?.image_url || DEFAULT_COVER,
          banner: best.trailer?.images?.maximum_image_url || best.images?.jpg?.large_image_url || null,
          synopsis: best.synopsis ? trimSynopsis(best.synopsis) : 'Sinopse não disponível.',
          genres: (best.genres || []).map(g => g.name),
          year: best.year || best.aired?.prop?.from?.year || null,
          status: translateStatus(best.status),
          score: best.score || null,
          found: true
        };
      }
    } catch (err) {
      console.warn('[anime-api] Falha ao buscar metadados de', folderName, err);
      // mantém o fallback
    }
  }

  await db.cacheApiResult(cacheKey, result);
  return result;
}

function trimSynopsis(text) {
  const clean = text.split('\n[Written by')[0].trim();
  return clean.length > 500 ? clean.slice(0, 497) + '…' : clean;
}

function translateStatus(status) {
  const map = {
    'Finished Airing': 'Finalizado',
    'Currently Airing': 'Em exibição',
    'Not yet aired': 'Não estreado'
  };
  return map[status] || status || 'Desconhecido';
}

function buildFallbackMetadata(folderName) {
  return {
    id: folderName,
    officialTitle: folderName,
    cover: DEFAULT_COVER,
    banner: null,
    synopsis: 'Nenhuma sinopse encontrada automaticamente. Você pode editar essas informações manualmente.',
    genres: [],
    year: null,
    status: 'Desconhecido',
    score: null,
    found: false
  };
}

/** Permite ao usuário sobrescrever manualmente nome/sinopse/capa de um anime. */
async function saveManualOverride(animeId, overrides) {
  const cacheKey = `anime:${animeId.toLowerCase()}`;
  const cached = await db.getCachedApiResult(cacheKey);
  const base = cached?.data || buildFallbackMetadata(animeId);
  const merged = { ...base, ...overrides, found: true, manuallyEdited: true };
  await db.cacheApiResult(cacheKey, merged);
  return merged;
}
