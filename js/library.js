/**
 * library.js
 * Constrói o modelo de dados combinado (scan da pasta + metadados da API +
 * progresso + favoritos) e renderiza as telas: início, biblioteca, favoritos,
 * continuar assistindo, busca e página de detalhes do anime.
 */

const AppState = {
  animes: [],          // resultado bruto do scan (com handles de arquivo)
  metadataById: {},     // id -> metadados vindos da API/cache
  progressById: {},      // "animeId::episodeId" -> progresso
  favoriteIds: new Set(),
  currentView: 'home',
  currentAnimeId: null
};

const viewRoot = () => document.getElementById('view-root');

function fmtEpisodeCount(anime) {
  const n = anime.episodeCount;
  return n === 1 ? '1 episódio' : `${n} episódios`;
}

function fmtTimeRemaining(progress) {
  if (!progress || !progress.duration) return '';
  const remaining = Math.max(0, progress.duration - progress.currentTime);
  const min = Math.round(remaining / 60);
  return min <= 1 ? '< 1min restante' : `${min}min restantes`;
}

async function refreshDerivedState() {
  const [progressList, favList] = await Promise.all([db.getAllProgress(), db.getAllFavorites()]);
  AppState.progressById = Object.fromEntries(progressList.map(p => [p.id, p]));
  AppState.favoriteIds = new Set(favList.map(f => f.id));
}

function getAnime(id) {
  return AppState.animes.find(a => a.id === id);
}

function getMeta(id) {
  return AppState.metadataById[id] || { officialTitle: id, cover: 'assets/images/default-cover.svg', genres: [], synopsis: '' };
}

function getAnimeProgressSummary(anime) {
  const allEpisodes = anime.seasons.flatMap(s => s.episodes.map(e => ({ season: s, episode: e })));
  let lastWatched = null;
  let watchedCount = 0;
  for (const { season, episode } of allEpisodes) {
    const p = AppState.progressById[`${anime.id}::${episode.id}`];
    if (p) {
      if (p.watched) watchedCount++;
      if (!lastWatched || p.updatedAt > lastWatched.progress.updatedAt) {
        lastWatched = { season, episode, progress: p };
      }
    }
  }
  return {
    lastWatched,
    watchedCount,
    total: allEpisodes.length,
    percent: allEpisodes.length ? Math.round((watchedCount / allEpisodes.length) * 100) : 0
  };
}

/* ---------------- Card & rail builders ---------------- */

function buildAnimeCard(anime, opts = {}) {
  const tpl = document.getElementById('tpl-anime-card');
  const node = tpl.content.cloneNode(true);
  const meta = getMeta(anime.id);
  const card = node.querySelector('.anime-card');
  const cover = node.querySelector('.anime-card-cover');
  const img = node.querySelector('img');
  const title = node.querySelector('.anime-card-title');
  const metaLine = node.querySelector('.anime-card-meta');
  const favBtn = node.querySelector('.btn-fav-toggle');
  const progressFill = node.querySelector('.anime-card-progress-fill');

  img.src = meta.cover;
  img.alt = meta.officialTitle;
  title.textContent = meta.officialTitle;

  const summary = getAnimeProgressSummary(anime);

  if (opts.variant === 'continue' && summary.lastWatched) {
    card.classList.add('anime-card-wide');
    cover.classList.add('always-play', 'landscape');
    const ep = summary.lastWatched.episode;
    metaLine.textContent = `Episódio ${ep.episodeNumber}`;
    const timeLine = document.createElement('p');
    timeLine.className = 'anime-card-time';
    timeLine.textContent = fmtTimeRemaining(summary.lastWatched.progress);
    metaLine.after(timeLine);
  } else if (opts.variant === 'new') {
    const badge = document.createElement('span');
    badge.className = 'card-badge';
    badge.textContent = 'Novo';
    cover.appendChild(badge);
    metaLine.textContent = fmtEpisodeCount(anime);
  } else {
    metaLine.textContent = [meta.genres?.[0], fmtEpisodeCount(anime)].filter(Boolean).join(' · ');
  }

  if (AppState.favoriteIds.has(anime.id)) favBtn.classList.add('active');
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isFav = await db.toggleFavorite(anime.id);
    favBtn.classList.toggle('active', isFav);
    showToast(isFav ? `${meta.officialTitle} adicionado aos favoritos` : `${meta.officialTitle} removido dos favoritos`);
  });

  progressFill.style.width = `${summary.percent}%`;

  card.addEventListener('click', () => navigateTo('detail', anime.id));
  return node;
}

function buildRail(title, animes, viewAllTarget, variant) {
  if (animes.length === 0) return null;
  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-header">
      <h2>${title.toUpperCase()}</h2>
      ${viewAllTarget ? `<a href="#" class="nav-link" data-view-all="${viewAllTarget}">Ver tudo ›</a>` : ''}
    </div>
    <div class="rail"></div>
  `;
  const rail = section.querySelector('.rail');
  animes.forEach(a => rail.appendChild(buildAnimeCard(a, { variant })));
  const viewAllLink = section.querySelector('[data-view-all]');
  if (viewAllLink) {
    viewAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(viewAllTarget);
    });
  }
  return section;
}

function buildGrid(animes) {
  const grid = document.createElement('div');
  grid.className = 'grid';
  animes.forEach(a => grid.appendChild(buildAnimeCard(a)));
  return grid;
}

function buildEmptyState(message, sub) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<h3>${message}</h3><p>${sub || ''}</p>`;
  return div;
}

/* ---------------- Views ---------------- */

function renderHome() {
  const root = viewRoot();
  root.innerHTML = '';

  if (AppState.animes.length === 0) {
    root.appendChild(buildEmptyState('Sua biblioteca está vazia', 'Verifique se a pasta selecionada contém subpastas com vídeos.'));
    return;
  }

  const heroCandidates = pickHeroCandidates();
  root.appendChild(buildHeroBanner(heroCandidates, 0));

  const continuing = getContinueWatchingList();
  const recent = [...AppState.animes].slice(-12).reverse();
  const favorites = AppState.animes.filter(a => AppState.favoriteIds.has(a.id));

  const sections = [
    buildRail('Continuar Assistindo', continuing.map(c => c.anime), 'continue', 'continue'),
    buildRail('Adicionados Recentemente', recent, 'library', 'new'),
    buildRail('Todos os Animes', AppState.animes, 'library'),
    buildRail('Favoritos', favorites, 'favorites')
  ].filter(Boolean);

  sections.forEach(s => root.appendChild(s));
}

function pickHeroCandidates() {
  const continuing = getContinueWatchingList().map(c => c.anime);
  const rest = AppState.animes.filter(a => !continuing.includes(a));
  return [...continuing, ...rest].slice(0, 6);
}

function buildHeroBanner(candidates, activeIndex) {
  const anime = candidates[activeIndex];
  const meta = getMeta(anime.id);
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.style.backgroundImage = `url("${meta.banner || meta.cover}")`;
  hero.innerHTML = `
    <div class="hero-content">
      <div class="hero-eyebrow">Em destaque</div>
      <h2>${meta.officialTitle}</h2>
      ${meta.genres?.length ? `<div class="hero-sub">${meta.genres.slice(0, 3).join(' • ')}</div>` : ''}
      <p class="hero-synopsis">${meta.synopsis}</p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" data-action="watch">▶ Assistir Agora</button>
        <button class="btn btn-ghost btn-lg" data-action="info">+ Minha Lista</button>
      </div>
    </div>
    ${candidates.length > 1 ? `<div class="hero-dots">${candidates.map((_, i) => `<span class="hero-dot${i === activeIndex ? ' active' : ''}" data-idx="${i}"></span>`).join('')}</div>` : ''}
  `;
  hero.querySelector('[data-action="watch"]').addEventListener('click', () => playNextUnwatched(anime.id));
  hero.querySelector('[data-action="info"]').addEventListener('click', () => navigateTo('detail', anime.id));
  hero.querySelectorAll('.hero-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.idx, 10);
      hero.replaceWith(buildHeroBanner(candidates, idx));
    });
  });
  return hero;
}

function getContinueWatchingList() {
  return AppState.animes
    .map(anime => ({ anime, summary: getAnimeProgressSummary(anime) }))
    .filter(x => x.summary.lastWatched && !x.summary.lastWatched.progress.watched)
    .sort((a, b) => b.summary.lastWatched.progress.updatedAt - a.summary.lastWatched.progress.updatedAt);
}

function renderLibrary() {
  const root = viewRoot();
  root.innerHTML = `<div class="section-header"><h2>Minha Biblioteca</h2></div>`;
  if (AppState.animes.length === 0) {
    root.appendChild(buildEmptyState('Nenhum anime encontrado', 'Clique em "Atualizar Biblioteca" após adicionar pastas.'));
    return;
  }
  root.appendChild(buildGrid(AppState.animes));
}

function renderFavorites() {
  const root = viewRoot();
  root.innerHTML = `<div class="section-header"><h2>Favoritos</h2></div>`;
  const favorites = AppState.animes.filter(a => AppState.favoriteIds.has(a.id));
  if (favorites.length === 0) {
    root.appendChild(buildEmptyState('Você ainda não tem favoritos', 'Clique no ícone de coração em qualquer anime para salvá-lo aqui.'));
    return;
  }
  root.appendChild(buildGrid(favorites));
}

function renderContinueWatching() {
  const root = viewRoot();
  root.innerHTML = `<div class="section-header"><h2>Continuar Assistindo</h2></div>`;
  const list = getContinueWatchingList();
  if (list.length === 0) {
    root.appendChild(buildEmptyState('Nada em andamento', 'Comece a assistir um episódio para vê-lo aqui.'));
    return;
  }
  root.appendChild(buildGrid(list.map(x => x.anime)));
}

function renderSearchResults(query) {
  const root = viewRoot();
  const q = query.trim().toLowerCase();
  const results = AppState.animes.filter(anime => {
    const meta = getMeta(anime.id);
    return meta.officialTitle.toLowerCase().includes(q) ||
      anime.name.toLowerCase().includes(q) ||
      (meta.genres || []).some(g => g.toLowerCase().includes(q));
  });
  root.innerHTML = `<div class="section-header"><h2>Resultados para "${escapeHtml(query)}"</h2></div>`;
  if (results.length === 0) {
    root.appendChild(buildEmptyState('Nenhum resultado encontrado', 'Tente pesquisar por outro nome ou gênero.'));
    return;
  }
  root.appendChild(buildGrid(results));
}

function renderSettings() {
  const root = viewRoot();
  root.innerHTML = `
    <div class="section-header"><h2>Configurações</h2></div>
    <div class="settings-list">
      <div class="settings-item">
        <div><h4>Pasta conectada</h4><p id="settings-folder-name">Verificando…</p></div>
        <button id="btn-change-folder" class="btn btn-outline">Trocar pasta</button>
      </div>
      <div class="settings-item">
        <div><h4>Revarredura automática</h4><p>Verifica novos episódios periodicamente enquanto o site está aberto.</p></div>
        <label class="switch"><input id="toggle-auto-scan" type="checkbox"></label>
      </div>
      <div class="settings-item">
        <div><h4>Limpar cache de capas/sinopses</h4><p>Força uma nova busca de metadados na próxima varredura.</p></div>
        <button id="btn-clear-cache" class="btn btn-outline">Limpar cache</button>
      </div>
      <div class="settings-item">
        <div><h4>Apagar todos os dados locais</h4><p>Remove biblioteca, progresso, favoritos e cache deste navegador.</p></div>
        <button id="btn-wipe-data" class="btn btn-outline" style="border-color:#c0392b;color:#ff8b7a;">Apagar tudo</button>
      </div>
    </div>
  `;
  document.getElementById('btn-change-folder').addEventListener('click', () => connectFolder(true));
  document.getElementById('btn-clear-cache').addEventListener('click', async () => {
    await db.clear('api_cache');
    showToast('Cache de metadados limpo. Atualize a biblioteca para buscar novamente.');
  });
  document.getElementById('btn-wipe-data').addEventListener('click', async () => {
    if (!confirm('Isso vai apagar toda a biblioteca, progresso e favoritos salvos neste navegador. Continuar?')) return;
    for (const store of ['handles', 'animes', 'progress', 'favorites', 'api_cache', 'settings']) {
      await db.clear(store);
    }
    location.reload();
  });
  const toggle = document.getElementById('toggle-auto-scan');
  db.getSetting('autoScan').then(val => { toggle.checked = val !== false; });
  toggle.addEventListener('change', () => db.setSetting('autoScan', toggle.checked));

  db.getFolderHandle().then(handle => {
    document.getElementById('settings-folder-name').textContent = handle ? (handle.name || 'Pasta conectada') : 'Nenhuma pasta conectada';
  });
}

async function renderAnimeDetail(animeId) {
  const anime = getAnime(animeId);
  const root = viewRoot();
  if (!anime) { root.innerHTML = ''; root.appendChild(buildEmptyState('Anime não encontrado')); return; }

  const meta = getMeta(animeId);
  const isFav = AppState.favoriteIds.has(animeId);

  root.innerHTML = `
    <div class="detail-banner" style="background-image:url('${meta.banner || meta.cover}')"></div>
    <div class="detail-header">
      <div class="detail-cover"><img src="${meta.cover}" alt="${escapeHtml(meta.officialTitle)}"></div>
      <div class="detail-meta">
        <h1>${escapeHtml(meta.officialTitle)}</h1>
        <div class="detail-tags">
          ${meta.year ? `<span class="tag">${meta.year}</span>` : ''}
          <span class="tag">${meta.status}</span>
          ${(meta.genres || []).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('')}
        </div>
        <p class="detail-synopsis">${escapeHtml(meta.synopsis)}</p>
        <div class="detail-actions">
          <button class="btn btn-primary btn-lg" id="btn-detail-watch">▶ Assistir</button>
          <button class="btn btn-ghost btn-lg" id="btn-detail-fav">${isFav ? '★ Favoritado' : '☆ Favoritar'}</button>
          <button class="btn btn-ghost btn-lg" id="btn-detail-edit">✎ Editar informações</button>
        </div>
      </div>
    </div>
    <div class="season-tabs" id="season-tabs"></div>
    <div id="episode-list"></div>
  `;

  document.getElementById('btn-detail-watch').addEventListener('click', () => playNextUnwatched(animeId));
  document.getElementById('btn-detail-fav').addEventListener('click', async () => {
    const fav = await db.toggleFavorite(animeId);
    AppState.favoriteIds[fav ? 'add' : 'delete'](animeId);
    renderAnimeDetail(animeId);
  });

  document.getElementById('btn-detail-edit').addEventListener('click', () => openEditModal(animeId));

  const tabsEl = document.getElementById('season-tabs');
  anime.seasons.forEach((season, idx) => {
    const tab = document.createElement('button');
    tab.className = 'season-tab' + (idx === 0 ? ' active' : '');
    tab.textContent = season.name;
    tab.addEventListener('click', () => {
      tabsEl.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderEpisodeList(anime, season);
    });
    tabsEl.appendChild(tab);
  });
  if (anime.seasons.length) renderEpisodeList(anime, anime.seasons[0]);
}

function renderEpisodeList(anime, season) {
  const container = document.getElementById('episode-list');
  container.innerHTML = '';
  season.episodes.forEach(ep => {
    const progress = AppState.progressById[`${anime.id}::${ep.id}`];
    const percent = progress && progress.duration ? Math.round((progress.currentTime / progress.duration) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'episode-row';
    row.innerHTML = `
      <div class="episode-thumb">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>
        <div class="ep-progress"><div class="ep-progress-fill" style="width:${percent}%"></div></div>
      </div>
      <div class="episode-info">
        <h4>Episódio ${ep.episodeNumber} — ${escapeHtml(ep.title)}</h4>
        <p>${ep.nativelyPlayable ? ep.extension.toUpperCase() : `${ep.extension.toUpperCase()} · pode exigir suporte adicional do navegador`}</p>
      </div>
      ${progress?.watched ? `<span class="episode-watched" title="Assistido"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ''}
    `;
    row.addEventListener('click', () => openPlayer(anime.id, season.number, ep.id));
    container.appendChild(row);
  });
}

function renderGenreSidebar() {
  const nav = document.getElementById('genre-nav');
  if (!nav) return;
  const counts = new Map();
  AppState.animes.forEach(anime => {
    (getMeta(anime.id).genres || []).forEach(g => counts.set(g, (counts.get(g) || 0) + 1));
  });
  const genres = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  if (genres.length === 0) {
    nav.innerHTML = '<span class="genre-nav-empty">Nenhum gênero identificado ainda</span>';
    return;
  }
  nav.innerHTML = '';
  genres.forEach(([genre, count]) => {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'genre-link';
    link.innerHTML = `<span>${escapeHtml(genre)}</span><span class="genre-count">${count}</span>`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      nav.querySelectorAll('.genre-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      renderGenreResults(genre);
    });
    nav.appendChild(link);
  });
}

function renderGenreResults(genre) {
  AppState.currentView = 'genre';
  document.querySelectorAll('.nav-link[data-view]').forEach(l => l.classList.remove('active'));
  const root = viewRoot();
  const results = AppState.animes.filter(a => (getMeta(a.id).genres || []).includes(genre));
  root.innerHTML = `<div class="section-header"><h2>GÊNERO: ${escapeHtml(genre).toUpperCase()}</h2></div>`;
  root.appendChild(results.length ? buildGrid(results) : buildEmptyState('Nenhum anime encontrado neste gênero'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateFolderBadge(name) {
  const badge = document.getElementById('folder-badge-name');
  if (badge) badge.textContent = name || 'Conectado';
}

function escapeHtml(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function playNextUnwatched(animeId) {
  const anime = getAnime(animeId);
  if (!anime) return;
  for (const season of anime.seasons) {
    for (const ep of season.episodes) {
      const p = AppState.progressById[`${animeId}::${ep.id}`];
      if (!p || !p.watched) {
        openPlayer(animeId, season.number, ep.id);
        return;
      }
    }
  }
  // tudo assistido — reinicia do primeiro episódio
  const first = anime.seasons[0]?.episodes[0];
  if (first) openPlayer(animeId, anime.seasons[0].number, first.id);
}
