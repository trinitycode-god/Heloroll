/**
 * database.js
 * Camada de persistência local usando IndexedDB.
 * Guarda: handle da pasta raiz, metadados dos animes, progresso de episódios,
 * favoritos e cache de informações vindas da API pública de animes.
 *
 * Nenhum dado sai do navegador do usuário.
 */
const DB_NAME = 'arigato-db';
const DB_VERSION = 1;

const STORES = {
  HANDLES: 'handles',       // referência do diretório raiz (File System Access API)
  ANIMES: 'animes',         // metadados de cada anime (id = nome da pasta)
  PROGRESS: 'progress',     // progresso por episódio (id = animeId::episodeId)
  FAVORITES: 'favorites',   // ids de animes favoritados
  API_CACHE: 'api_cache',   // cache das buscas na Jikan API
  SETTINGS: 'settings'
};

class Database {
  constructor() {
    this._db = null;
  }

  async open() {
    if (this._db) return this._db;
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.HANDLES)) db.createObjectStore(STORES.HANDLES);
        if (!db.objectStoreNames.contains(STORES.ANIMES)) db.createObjectStore(STORES.ANIMES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.PROGRESS)) db.createObjectStore(STORES.PROGRESS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.FAVORITES)) db.createObjectStore(STORES.FAVORITES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.API_CACHE)) db.createObjectStore(STORES.API_CACHE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) db.createObjectStore(STORES.SETTINGS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._db;
  }

  async _tx(storeName, mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ---- genérico ----
  async put(storeName, value, key) {
    return this._tx(storeName, 'readwrite', (store) => store.put(value, key));
  }
  async get(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async getAll(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async delete(storeName, key) {
    return this._tx(storeName, 'readwrite', (store) => store.delete(key));
  }
  async clear(storeName) {
    return this._tx(storeName, 'readwrite', (store) => store.clear());
  }

  // ---- helpers específicos ----
  async saveFolderHandle(handle) { return this.put(STORES.HANDLES, handle, 'root'); }
  async getFolderHandle() { return this.get(STORES.HANDLES, 'root'); }

  async saveAnime(anime) { return this.put(STORES.ANIMES, anime); }
  async getAllAnimes() { return this.getAll(STORES.ANIMES); }
  async deleteAnime(id) { return this.delete(STORES.ANIMES, id); }

  async saveProgress(animeId, episodeId, currentTime, duration) {
    const id = `${animeId}::${episodeId}`;
    return this.put(STORES.PROGRESS, {
      id, animeId, episodeId, currentTime, duration,
      watched: duration > 0 && currentTime / duration > 0.9,
      updatedAt: Date.now()
    });
  }
  async getProgress(animeId, episodeId) { return this.get(STORES.PROGRESS, `${animeId}::${episodeId}`); }
  async getAllProgress() { return this.getAll(STORES.PROGRESS); }

  async toggleFavorite(animeId) {
    const existing = await this.get(STORES.FAVORITES, animeId);
    if (existing) { await this.delete(STORES.FAVORITES, animeId); return false; }
    await this.put(STORES.FAVORITES, { id: animeId, addedAt: Date.now() });
    return true;
  }
  async isFavorite(animeId) { return !!(await this.get(STORES.FAVORITES, animeId)); }
  async getAllFavorites() { return this.getAll(STORES.FAVORITES); }

  async cacheApiResult(key, data) {
    return this.put(STORES.API_CACHE, { id: key, data, cachedAt: Date.now() });
  }
  async getCachedApiResult(key) { return this.get(STORES.API_CACHE, key); }

  async setSetting(key, value) { return this.put(STORES.SETTINGS, value, key); }
  async getSetting(key) { return this.get(STORES.SETTINGS, key); }
}

const db = new Database();
