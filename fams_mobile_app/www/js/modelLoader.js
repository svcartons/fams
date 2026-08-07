/**
 * Face-api model loader for Capacitor Android.
 * Bundled APK shards are often gzip-compressed/truncated — cache full files from laptop server.
 */
(function () {
  const DB_NAME = 'fams_models_db';
  const DB_VERSION = 1;
  const STORE = 'files';
  const CACHE_KEY = 'fams_models_cached_v2';

  /** Tiny detector + landmarks + recognition (~7 MB total, vs ~12 MB with SSD) */
  const MODEL_FILES = [
    { name: 'tiny_face_detector_model-weights_manifest.json', minBytes: 2_000, isJson: true },
    { name: 'tiny_face_detector_model-shard1', minBytes: 180_000 },
    { name: 'face_landmark_68_model-weights_manifest.json', minBytes: 5_000, isJson: true },
    { name: 'face_landmark_68_model-shard1', minBytes: 350_000 },
    { name: 'face_recognition_model-weights_manifest.json', minBytes: 10_000, isJson: true },
    { name: 'face_recognition_model-shard1', minBytes: 4_000_000 },
    { name: 'face_recognition_model-shard2', minBytes: 2_000_000 },
  ];

  /** In-memory cache used by fetch/XHR patch */
  const memory = new Map();

  function modelFileName(url) {
    if (!url || typeof url !== 'string') return null;
    const clean = url.split('?')[0];
    for (const f of MODEL_FILES) {
      if (clean.endsWith('/' + f.name) || clean.endsWith(f.name)) return f.name;
    }
    return null;
  }

  function isModelAssetUrl(url) {
    return !!modelFileName(url);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'name' });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function idbGetAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(name, data) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ name, data, savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function putMemory(name, data) {
    memory.set(name, data);
  }

  function getMemory(name) {
    return memory.get(name);
  }

  async function loadFromIndexedDb() {
    const rows = await idbGetAll();
    if (rows.length < MODEL_FILES.length) return false;
    for (const f of MODEL_FILES) {
      const row = rows.find(r => r.name === f.name);
      if (!row?.data || row.data.byteLength < f.minBytes) return false;
      putMemory(f.name, row.data);
    }
    localStorage.setItem(CACHE_KEY, 'true');
    return true;
  }

  async function xhrGetBytes(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
        else reject(new Error(`HTTP ${xhr.status} for ${url}`));
      };
      xhr.onerror = () => reject(new Error(`Network error: ${url}`));
      xhr.send();
    });
  }

  async function downloadOne(baseUrl, fileMeta, useNativeFetch) {
    const url = `${baseUrl.replace(/\/+$/, '')}/${fileMeta.name}`;
    let buf;
    if (useNativeFetch && window.__famsNativeFetch) {
      const res = await window.__famsNativeFetch(url);
      if (!res.ok) throw new Error(`Failed ${fileMeta.name} (${res.status})`);
      buf = await res.arrayBuffer();
    } else {
      buf = await xhrGetBytes(url);
    }
    if (!buf || buf.byteLength < fileMeta.minBytes) {
      throw new Error(`${fileMeta.name} incomplete (${buf?.byteLength ?? 0} bytes)`);
    }
    putMemory(fileMeta.name, buf);
    await idbPut(fileMeta.name, buf);
    return buf.byteLength;
  }

  async function downloadAllFromBase(baseUrl, useNativeFetch = false) {
    for (const f of MODEL_FILES) {
      await downloadOne(baseUrl, f, useNativeFetch);
    }
    localStorage.setItem(CACHE_KEY, 'true');
  }

  function localBundledBase() {
    const origin = window.location.origin || '';
    return `${origin}/models`;
  }

  function serverModelsBase() {
    if (!window.famsApi?.hasServerConfigured?.()) return null;
    const s = window.famsApi.getServerUrl();
    if (!s || /localhost|127\.0\.0\.1/i.test(s)) return null;
    return `${s.replace(/\/+$/, '')}/models`;
  }

  async function tryDownloadFromLocalBundle() {
    const base = localBundledBase();
    try {
      await downloadAllFromBase(base, false);
      return true;
    } catch {
      memory.clear();
      return false;
    }
  }

  async function tryDownloadFromServer() {
    const base = serverModelsBase();
    if (!base) return false;
    try {
      if (window.famsApi?.testConnection) await window.famsApi.testConnection();
      await downloadAllFromBase(base, true);
      return true;
    } catch (err) {
      console.warn('Server model download failed:', err.message);
      memory.clear();
      return false;
    }
  }

  /**
   * Ensure all model files are in memory (IDB → local APK → laptop server).
   * @param {{ requireServer?: boolean }} opts
   */
  async function ensureModels(opts = {}) {
    if (memory.size >= MODEL_FILES.length) return localBundledBase();

    if (localStorage.getItem(CACHE_KEY) === 'true') {
      const ok = await loadFromIndexedDb();
      if (ok) return localBundledBase();
    }

    if (await loadFromIndexedDb()) return localBundledBase();

    if (await tryDownloadFromLocalBundle()) return localBundledBase();

    if (await tryDownloadFromServer()) return localBundledBase();

    if (opts.requireServer !== false && serverModelsBase()) {
      throw new Error('AI models not on phone yet. Tap Connect → enter laptop IP → Pair & sync (downloads models once).');
    }

    throw new Error('AI models missing. Connect phone to same Wi‑Fi as laptop, enter server IP, then Pair & sync.');
  }

  function responseForFile(name) {
    const meta = MODEL_FILES.find(f => f.name === name);
    const data = getMemory(name);
    if (!data || !meta) return null;
    if (meta.isJson) {
      const text = new TextDecoder().decode(new Uint8Array(data));
      return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(data, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  }

  const nativeFetch = window.fetch.bind(window);
  window.__famsNativeFetch = nativeFetch;

  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const name = modelFileName(url);
    if (name && getMemory(name)) {
      const res = responseForFile(name);
      if (res) return Promise.resolve(res);
    }
    return nativeFetch(input, init);
  };

  function xhrGet(url, responseType) {
    const name = modelFileName(url);
    if (name && getMemory(name)) {
      const data = getMemory(name);
      const meta = MODEL_FILES.find(f => f.name === name);
      if (responseType === 'text' && meta?.isJson) {
        return Promise.resolve(new TextDecoder().decode(new Uint8Array(data)));
      }
      if (responseType === 'arraybuffer') return Promise.resolve(data);
    }
    return xhrGetBytes(url).then(buf => {
      if (responseType === 'text') return new TextDecoder().decode(new Uint8Array(buf));
      return buf;
    });
  }

  window.famsModelLoader = {
    ensureModels,
    resolveModelBase: localBundledBase,
    isCached: () => localStorage.getItem(CACHE_KEY) === 'true' && memory.size >= MODEL_FILES.length,
    clearCache: async () => {
      memory.clear();
      localStorage.removeItem(CACHE_KEY);
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    },
    /** Call after server URL is configured — downloads from laptop if needed */
    syncFromServer: tryDownloadFromServer,
  };
})();
