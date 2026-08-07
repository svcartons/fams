/** Offline punch queue for the web kiosk (IndexedDB with localStorage fallback). */

export type KioskQueuedEvent = {
  localId: string;
  clientEventId: string;
  employeeCode: string;
  workerName?: string;
  eventType: string;
  method: string;
  confidence: number | null;
  timestamp: string;
};

const DB_NAME = 'fams_kiosk';
const STORE = 'offline_queue';
const LS_KEY = 'fams_kiosk_offline_queue';

function makeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readLocalStorage(): KioskQueuedEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStorage(items: KioskQueuedEvent[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'localId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetAll(): Promise<KioskQueuedEvent[] | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as KioskQueuedEvent[]) || []);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(item: KioskQueuedEvent): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbDeleteMany(localIds: string[]): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const id of localIds) store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getQueuedEvents(): Promise<KioskQueuedEvent[]> {
  const fromIdb = await idbGetAll();
  if (fromIdb) return fromIdb;
  return readLocalStorage();
}

export async function getPendingCount(): Promise<number> {
  return (await getQueuedEvents()).length;
}

export async function enqueueOfflinePunch(event: {
  clientEventId?: string;
  employeeCode: string;
  workerName?: string;
  eventType?: string;
  method?: string;
  confidence?: number | null;
  timestamp?: string;
}): Promise<KioskQueuedEvent> {
  const item: KioskQueuedEvent = {
    localId: makeId(),
    clientEventId: event.clientEventId || makeId(),
    employeeCode: event.employeeCode,
    workerName: event.workerName,
    eventType: event.eventType || 'auto',
    method: event.method || 'face',
    confidence: event.confidence ?? null,
    timestamp: event.timestamp || new Date().toISOString(),
  };

  const ok = await idbPut(item);
  if (!ok) {
    const queue = readLocalStorage();
    queue.push(item);
    writeLocalStorage(queue);
  }
  return item;
}

export async function removeQueuedByLocalIds(localIds: string[]): Promise<void> {
  if (localIds.length === 0) return;
  const ok = await idbDeleteMany(localIds);
  if (!ok) {
    const ids = new Set(localIds);
    writeLocalStorage(readLocalStorage().filter((e) => !ids.has(e.localId)));
  }
}

export async function removeQueuedByClientEventIds(clientEventIds: string[]): Promise<void> {
  if (clientEventIds.length === 0) return;
  const all = await getQueuedEvents();
  const toRemove = all
    .filter((e) => clientEventIds.includes(e.clientEventId))
    .map((e) => e.localId);
  await removeQueuedByLocalIds(toRemove);
}
