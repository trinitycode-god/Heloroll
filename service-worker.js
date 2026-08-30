/**
 * service-worker.js
 * Faz cache apenas dos arquivos da própria interface (HTML/CSS/JS/ícones),
 * para permitir instalação como PWA e um carregamento inicial mais rápido.
 *
 * IMPORTANTE: nunca cacheamos vídeos ou arquivos da pasta local do usuário —
 * eles são acessados via File System Access API diretamente do disco, e as
 * respostas da API de metadados também não passam por aqui (o cache delas
 * fica no IndexedDB, controlado por js/anime-api.js).
 */

const CACHE_NAME = 'arigato-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/database.js',
  './js/filesystem.js',
  './js/anime-api.js',
  './js/library.js',
  './js/player.js',
  './js/edit-modal.js',
  './js/app.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/images/default-cover.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar chamadas à API externa de metadados — deixa passar direto.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
