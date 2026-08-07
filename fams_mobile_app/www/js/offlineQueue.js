// Offline attendance queue — persists scans until bulk-sync to FAMS server

const QUEUE_KEY = 'fams_offline_queue';
const WORKERS_CACHE_KEY = 'fams_workers_cache';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  localStorage.removeItem('fams_synced_state');
  if (window.famsApi?.updatePendingHeartbeat) {
    window.famsApi.updatePendingHeartbeat();
  }
  window.dispatchEvent(new CustomEvent('fams-queue-changed', { detail: { count: items.length } }));
}

function makeLocalId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function enqueue(event) {
  const item = {
    localId: makeLocalId(),
    clientEventId: event.clientEventId || makeLocalId(),
    employeeCode: event.employeeCode,
    workerName: event.workerName || event.employeeCode,
    eventType: event.eventType || 'auto',
    method: event.method || 'mobile_scan',
    confidence: event.confidence ?? null,
    timestamp: event.timestamp || new Date().toISOString(),
    deviceSequence: event.deviceSequence ?? null,
    snapshotThumb: event.snapshotThumb || null,
  };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  return item;
}

function getPendingCount() {
  return readQueue().length;
}

function getPendingEvents() {
  return readQueue();
}

function clearMerged(localIds) {
  const ids = new Set(localIds);
  writeQueue(readQueue().filter(e => !ids.has(e.localId)));
}

function removeByLocalIds(localIds) {
  clearMerged(localIds);
}

function setWorkersCache(workers) {
  localStorage.setItem(WORKERS_CACHE_KEY, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    workers: workers.map(w => ({
      employeeCode: w.employeeCode,
      name: w.name,
      department: w.department || '',
      avatarPhoto: w.avatarPhoto || null,
    })),
  }));
}

function getWorkersCache() {
  try {
    const data = JSON.parse(localStorage.getItem(WORKERS_CACHE_KEY) || 'null');
    return data?.workers || [];
  } catch {
    return [];
  }
}

function findWorkerName(employeeCode) {
  const w = getWorkersCache().find(x => x.employeeCode === employeeCode);
  return w?.name || employeeCode;
}

window.famsQueue = {
  QUEUE_KEY,
  WORKERS_CACHE_KEY,
  readQueue,
  enqueue,
  getPendingCount,
  getPendingEvents,
  removeByLocalIds,
  setWorkersCache,
  getWorkersCache,
  findWorkerName,
};
