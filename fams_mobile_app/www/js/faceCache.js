// IndexedDB cache for face descriptors (offline recognition)

const DB_NAME = 'fams_kiosk_db';
const DB_VERSION = 1;
const STORE_FACES = 'faces';
const STORE_META = 'meta';
const DESCRIPTOR_FLOATS = 128;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FACES)) {
        db.createObjectStore(STORE_FACES, { keyPath: 'employeeCode' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function descriptorToBase64(arr) {
  const f32 = arr instanceof Float32Array ? arr : new Float32Array(arr);
  if (f32.length !== DESCRIPTOR_FLOATS) {
    throw new Error(`Invalid descriptor: ${f32.length} floats (expected ${DESCRIPTOR_FLOATS})`);
  }
  const bytes = new Uint8Array(f32.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToFloat32(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const f32 = new Float32Array(bytes.buffer);
    if (f32.length !== DESCRIPTOR_FLOATS) return null;
    return f32;
  } catch {
    return null;
  }
}

function normalizeIncomingDescriptor(descriptor) {
  if (!descriptor) return null;
  if (descriptor instanceof Float32Array) {
    return descriptor.length === DESCRIPTOR_FLOATS ? descriptor : null;
  }
  if (Array.isArray(descriptor)) {
    if (descriptor.length !== DESCRIPTOR_FLOATS) return null;
    return new Float32Array(descriptor);
  }
  return null;
}

async function saveFaces(faces) {
  const db = await openDb();
  const tx = db.transaction([STORE_FACES, STORE_META], 'readwrite');
  const faceStore = tx.objectStore(STORE_FACES);
  faceStore.clear();
  let saved = 0;
  for (const f of faces) {
    if (!f.employeeCode) continue;
    const normalized = normalizeIncomingDescriptor(f.descriptor);
    if (!normalized) continue;
    faceStore.put({
      employeeCode: f.employeeCode,
      name: f.name || f.employeeCode,
      descriptorB64: descriptorToBase64(normalized),
    });
    saved++;
  }
  tx.objectStore(STORE_META).put({
    key: 'faces_updated_at',
    value: new Date().toISOString(),
    count: saved,
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(saved);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFaces() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FACES).objectStore(STORE_FACES).getAll();
    req.onsuccess = () => {
      const out = [];
      for (const row of req.result || []) {
        const descriptor = base64ToFloat32(row.descriptorB64);
        if (!descriptor) continue;
        out.push({
          employeeCode: row.employeeCode,
          name: row.name,
          descriptor,
        });
      }
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getFaceCount() {
  const faces = await getAllFaces();
  return faces.length;
}

async function getMeta() {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE_META).objectStore(STORE_META).get('faces_updated_at');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function clearFaces() {
  const db = await openDb();
  const tx = db.transaction([STORE_FACES, STORE_META], 'readwrite');
  tx.objectStore(STORE_FACES).clear();
  tx.objectStore(STORE_META).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

window.famsFaceCache = {
  saveFaces,
  getAllFaces,
  getFaceCount,
  getMeta,
  clearFaces,
  base64ToFloat32,
  DESCRIPTOR_FLOATS,
};
