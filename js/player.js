/**
 * player.js
 * Player integrado ao próprio site, usando a tag <video> nativa e um
 * Object URL criado a partir do arquivo local selecionado pelo usuário
 * (via FileSystemFileHandle.getFile()). Nenhum arquivo é enviado para
 * lugar nenhum — tudo acontece localmente no navegador.
 */

const PlayerState = {
  animeId: null,
  seasonNumber: null,
  episodeId: null,
  objectUrl: null,
  saveInterval: null
};

const videoEl = document.getElementById('video-el');

async function openPlayer(animeId, seasonNumber, episodeId) {
  const anime = getAnime(animeId);
  const season = anime?.seasons.find(s => s.number === seasonNumber);
  const episode = season?.episodes.find(e => e.id === episodeId);
  if (!episode) { showToast('Episódio não encontrado.'); return; }

  document.getElementById('player-screen').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  PlayerState.animeId = animeId;
  PlayerState.seasonNumber = seasonNumber;
  PlayerState.episodeId = episodeId;

  const meta = getMeta(animeId);
  document.getElementById('player-anime-title').textContent = meta.officialTitle;
  document.getElementById('player-episode-title').textContent = `Episódio ${episode.episodeNumber} — ${episode.title}`;

  const warningEl = document.getElementById('unsupported-codec-warning');
  warningEl.classList.toggle('hidden', episode.nativelyPlayable);

  await loadEpisodeFile(episode);
  renderPlayerEpisodeList(anime, season, episodeId);

  const progress = await db.getProgress(animeId, episodeId);
  if (progress && progress.currentTime > 3 && !progress.watched) {
    videoEl.currentTime = progress.currentTime;
  }

  clearInterval(PlayerState.saveInterval);
  PlayerState.saveInterval = setInterval(saveCurrentProgress, 5000);
}

async function loadEpisodeFile(episode) {
  if (PlayerState.objectUrl) {
    URL.revokeObjectURL(PlayerState.objectUrl);
    PlayerState.objectUrl = null;
  }
  try {
    const file = await episode.handle.getFile();
    const url = URL.createObjectURL(file);
    PlayerState.objectUrl = url;
    videoEl.src = url;
    await videoEl.play().catch(() => { /* autoplay pode ser bloqueado — ok, usuário clica play */ });
  } catch (err) {
    console.error(err);
    showToast('Não foi possível abrir este arquivo. A permissão da pasta pode ter expirado — tente reconectar.');
  }
}

async function saveCurrentProgress() {
  if (!PlayerState.animeId || !videoEl.duration) return;
  await db.saveProgress(PlayerState.animeId, PlayerState.episodeId, videoEl.currentTime, videoEl.duration);
  await refreshDerivedState();
}

function closePlayer() {
  clearInterval(PlayerState.saveInterval);
  saveCurrentProgress().finally(() => {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    if (PlayerState.objectUrl) URL.revokeObjectURL(PlayerState.objectUrl);
    PlayerState.objectUrl = null;
    document.getElementById('player-screen').classList.add('hidden');
    document.getElementById('player-episode-panel').classList.add('hidden');
    document.body.style.overflow = '';
    // Recarrega a view atual para refletir progresso/assistido
    if (AppState.currentView === 'detail') renderAnimeDetail(AppState.currentAnimeId);
    else navigateTo(AppState.currentView);
  });
}

function getEpisodeNavigation() {
  const anime = getAnime(PlayerState.animeId);
  const allEpisodes = anime.seasons.flatMap(s => s.episodes.map(e => ({ season: s, episode: e })));
  const idx = allEpisodes.findIndex(x => x.episode.id === PlayerState.episodeId);
  return {
    prev: idx > 0 ? allEpisodes[idx - 1] : null,
    next: idx < allEpisodes.length - 1 ? allEpisodes[idx + 1] : null
  };
}

function renderPlayerEpisodeList(anime, currentSeason, currentEpisodeId) {
  const list = document.getElementById('player-episode-list');
  list.innerHTML = '';
  currentSeason.episodes.forEach(ep => {
    const row = document.createElement('div');
    row.className = 'episode-row' + (ep.id === currentEpisodeId ? ' playing' : '');
    row.innerHTML = `<div class="episode-info"><h4>Ep. ${ep.episodeNumber} — ${escapeHtml(ep.title)}</h4></div>`;
    row.addEventListener('click', () => openPlayer(anime.id, currentSeason.number, ep.id));
    list.appendChild(row);
  });
}

function fmtTime(seconds) {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function initPlayerControls() {
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const progressBar = document.getElementById('progress-bar');
  const volumeBar = document.getElementById('volume-bar');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');

  btnPlayPause.addEventListener('click', () => {
    if (videoEl.paused) videoEl.play(); else videoEl.pause();
  });
  videoEl.addEventListener('play', () => { iconPlay.classList.add('hidden'); iconPause.classList.remove('hidden'); });
  videoEl.addEventListener('pause', () => { iconPlay.classList.remove('hidden'); iconPause.classList.add('hidden'); });

  videoEl.addEventListener('timeupdate', () => {
    if (!videoEl.duration) return;
    progressBar.value = (videoEl.currentTime / videoEl.duration) * 100;
    timeCurrent.textContent = fmtTime(videoEl.currentTime);
    timeDuration.textContent = fmtTime(videoEl.duration);
  });
  progressBar.addEventListener('input', () => {
    if (!videoEl.duration) return;
    videoEl.currentTime = (progressBar.value / 100) * videoEl.duration;
  });

  volumeBar.addEventListener('input', () => { videoEl.volume = volumeBar.value; });

  videoEl.addEventListener('ended', () => {
    db.saveProgress(PlayerState.animeId, PlayerState.episodeId, videoEl.duration, videoEl.duration);
    const { next } = getEpisodeNavigation();
    if (next) openPlayer(PlayerState.animeId, next.season.number, next.episode.id);
    else showToast('Você chegou ao último episódio disponível.');
  });

  document.getElementById('btn-next-ep').addEventListener('click', () => {
    const { next } = getEpisodeNavigation();
    if (next) openPlayer(PlayerState.animeId, next.season.number, next.episode.id);
  });
  document.getElementById('btn-prev-ep').addEventListener('click', () => {
    const { prev } = getEpisodeNavigation();
    if (prev) openPlayer(PlayerState.animeId, prev.season.number, prev.episode.id);
  });

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    const wrap = document.querySelector('.player-wrap');
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen().catch(() => {});
  });

  document.getElementById('btn-episode-list-toggle').addEventListener('click', () => {
    document.getElementById('player-episode-panel').classList.toggle('hidden');
  });

  document.getElementById('btn-player-back').addEventListener('click', closePlayer);

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('player-screen').classList.contains('hidden')) return;
    if (e.code === 'Space') { e.preventDefault(); btnPlayPause.click(); }
    if (e.code === 'Escape') closePlayer();
    if (e.code === 'ArrowRight') videoEl.currentTime += 10;
    if (e.code === 'ArrowLeft') videoEl.currentTime -= 10;
  });
}
