/**
 * app.js
 * Ponto de entrada: decide qual tela mostrar ao abrir o site, orquestra a
 * conexão com a pasta local, a varredura da biblioteca, o roteamento entre
 * views e o registro do Service Worker (PWA).
 */

const AUTO_RESCAN_INTERVAL_MS = 1000 * 60 * 5; // 5 minutos
let autoRescanTimer = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

async function boot() {
  if (!isFileSystemAccessSupported()) {
    document.getElementById('fs-support-warning').classList.remove('hidden');
  }

  await refreshDerivedState();

  const restored = await tryRestoreRootFolder();
  if (restored && !restored.pendingHandle) {
    // permissão já concedida — inicia direto
    await runFullScan(restored);
    return;
  }
  if (restored && restored.pendingHandle) {
    document.getElementById('btn-reconnect-folder').classList.remove('hidden');
    document.getElementById('btn-reconnect-folder').onclick = async () => {
      const granted = await requestPermissionFor(restored.pendingHandle);
      if (granted) await runFullScan(restored.pendingHandle);
      else showToast('Permissão negada. Selecione a pasta novamente.');
    };
  }

  showScreen('welcome-screen');
}

async function connectFolder(isReconnect = false) {
  try {
    const handle = await pickRootFolder();
    await runFullScan(handle, isReconnect);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      showToast('Não foi possível acessar a pasta selecionada.');
    }
  }
}

async function runFullScan(rootHandle, isReconnect = false) {
  showScreen('scan-screen');
  const progressEl = document.getElementById('scan-progress');

  try {
    const oldAnimes = await db.getAllAnimes();
    const scanned = await scanLibrary(rootHandle, (msg) => { progressEl.textContent = msg; });

    if (oldAnimes.length > 0) {
      const changes = diffLibrary(oldAnimes, scanned);
      notifyChanges(changes);
    }

    progressEl.textContent = 'Buscando capas e sinopses…';
    await enrichWithMetadata(scanned, (done, total) => {
      progressEl.textContent = `Buscando informações dos animes… (${done}/${total})`;
    });

    await persistLibrary(scanned);
    AppState.animes = scanned;

    renderGenreSidebar();
    updateFolderBadge(rootHandle.name);

    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('app').classList.remove('hidden');

    navigateTo('home');
    startAutoRescan(rootHandle);

    if (isReconnect) showToast('Pasta reconectada com sucesso.');
  } catch (err) {
    console.error(err);
    showToast('Erro ao ler a pasta. Verifique as permissões e tente novamente.');
    showScreen('welcome-screen');
  }
}

async function enrichWithMetadata(animes, onProgress) {
  let done = 0;
  for (const anime of animes) {
    const meta = await fetchAnimeMetadata(anime.name);
    AppState.metadataById[anime.id] = meta;
    done++;
    if (onProgress) onProgress(done, animes.length);
  }
}

async function persistLibrary(animes) {
  // Guardamos apenas metadados serializáveis (sem os FileSystemFileHandle,
  // que não podem ser clonados no IndexedDB em todos os navegadores de forma
  // confiável entre sessões diferentes — eles são recriados a cada scan).
  for (const anime of animes) {
    await db.saveAnime({
      id: anime.id,
      name: anime.name,
      episodeCount: anime.episodeCount,
      seasonCount: anime.seasons.length,
      lastScannedAt: Date.now()
    });
  }
}

function notifyChanges(changes) {
  if (changes.newAnimes.length) {
    showToast(`Novo anime detectado: ${changes.newAnimes.join(', ')}`);
  }
  changes.newEpisodes.forEach(c => {
    showToast(`${c.count} novo(s) episódio(s) em ${c.anime}`);
  });
}

async function manualRescan() {
  const handle = await db.getFolderHandle();
  if (!handle) { showToast('Nenhuma pasta conectada.'); return; }
  const perm = await handle.queryPermission({ mode: 'read' });
  if (perm !== 'granted') {
    const granted = await requestPermissionFor(handle);
    if (!granted) { showToast('Permissão necessária para revarrer a pasta.'); return; }
  }
  showToast('Atualizando biblioteca…');
  await runFullScan(handle, true);
}

function startAutoRescan(rootHandle) {
  clearInterval(autoRescanTimer);
  autoRescanTimer = setInterval(async () => {
    const autoScanEnabled = await db.getSetting('autoScan');
    if (autoScanEnabled === false) return;
    const perm = await rootHandle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') return; // não interrompe o usuário silenciosamente
    const oldAnimes = await db.getAllAnimes();
    const scanned = await scanLibrary(rootHandle);
    const changes = diffLibrary(oldAnimes, scanned);
    if (changes.newAnimes.length || changes.newEpisodes.length) {
      await enrichWithMetadata(scanned);
      await persistLibrary(scanned);
      AppState.animes = scanned;
      notifyChanges(changes);
      if (['home', 'library'].includes(AppState.currentView)) navigateTo(AppState.currentView);
    }
  }, AUTO_RESCAN_INTERVAL_MS);
}

/* ---------------- Roteamento ---------------- */

function navigateTo(view, param = null) {
  AppState.currentView = view;
  AppState.currentAnimeId = view === 'detail' ? param : null;

  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.classList.toggle('active', link.dataset.view === view);
  });

  switch (view) {
    case 'home': renderHome(); break;
    case 'library': renderLibrary(); break;
    case 'favorites': renderFavorites(); break;
    case 'continue': renderContinueWatching(); break;
    case 'settings': renderSettings(); break;
    case 'detail': renderAnimeDetail(param); break;
    default: renderHome();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------------- Inicialização de eventos ---------------- */

function initGlobalEvents() {
  document.getElementById('btn-connect-folder').addEventListener('click', () => connectFolder(false));
  document.getElementById('btn-refresh-library').addEventListener('click', manualRescan);
  document.getElementById('btn-sidebar-disconnect').addEventListener('click', (e) => {
    e.preventDefault();
    connectFolder(true);
  });

  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.genre-link').forEach(l => l.classList.remove('active'));
      navigateTo(link.dataset.view);
    });
  });

  let searchDebounce = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const query = e.target.value;
    searchDebounce = setTimeout(() => {
      if (query.trim().length === 0) navigateTo('home');
      else renderSearchResults(query);
    }, 250);
  });

  initPlayerControls();
  initEditModal();

  const sidebarToggle = document.getElementById('btn-sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(err => {
        console.warn('Service worker não registrado:', err);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initGlobalEvents();
  registerServiceWorker();
  boot();
});
