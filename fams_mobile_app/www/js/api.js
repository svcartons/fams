// FAMS Mobile API Client

const STORAGE_KEYS = {
  serverUrl: 'fams_server_url',
  supervisorToken: 'fams_supervisor_token',
  supervisorUser: 'fams_supervisor_user',
  terminalToken: 'fams_terminal_token',
  terminalId: 'fams_terminal_id',
  terminalName: 'fams_terminal_name',
  deviceId: 'fams_device_id',
};

const DEFAULT_SERVER = 'http://192.168.1.100:3007';

function normalizeServerUrl(url) {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

function getServerUrl() {
  const saved = localStorage.getItem(STORAGE_KEYS.serverUrl)
    || localStorage.getItem('fams_last_good_server');
  return normalizeServerUrl(saved || DEFAULT_SERVER);
}

function hasServerConfigured() {
  return !!(localStorage.getItem(STORAGE_KEYS.serverUrl) || localStorage.getItem('fams_last_good_server'));
}

function validateServerUrlForMobile(url) {
  const u = normalizeServerUrl(url);
  if (/localhost|127\.0\.0\.1/i.test(u)) {
    throw new Error('Use your laptop\'s Wi‑Fi IP (e.g. 192.168.1.5:3007), not localhost — the phone cannot reach localhost on your laptop.');
  }
  return u;
}

function setServerUrl(url) {
  const normalized = validateServerUrlForMobile(url);
  localStorage.setItem(STORAGE_KEYS.serverUrl, normalized);
  localStorage.setItem('fams_last_good_server', normalized);
  return normalized;
}

function getApiBase() {
  return `${getServerUrl()}/api`;
}

function getDeviceId() {
  let id = localStorage.getItem(STORAGE_KEYS.deviceId);
  if (!id) {
    id = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(STORAGE_KEYS.deviceId, id);
  }
  return id;
}

function isPaired() {
  return !!localStorage.getItem(STORAGE_KEYS.terminalToken);
}

function isSupervisorLoggedIn() {
  return !!localStorage.getItem(STORAGE_KEYS.supervisorToken);
}

function isAuthenticated() {
  return isPaired() || isSupervisorLoggedIn();
}

function getAuthToken() {
  return localStorage.getItem(STORAGE_KEYS.supervisorToken)
    || localStorage.getItem(STORAGE_KEYS.terminalToken);
}

async function famsFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${getApiBase()}${endpoint}`, { ...options, headers });
  } catch {
    throw new Error(`Cannot reach server at ${getServerUrl()}. Check Wi‑Fi and server address in Settings.`);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`;
    // Only clear session on 401 — 403 may be a permission issue, not invalid terminal token
    if (response.status === 401) {
      clearSession();
    }
    throw new Error(message);
  }

  return data;
}

async function testConnection() {
  const url = getServerUrl();
  validateServerUrlForMobile(url);
  const res = await fetch(`${url}/api/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Server responded with ${res.status}`);
  const data = await res.json();
  localStorage.setItem('fams_last_good_server', url);
  return data;
}

/** Try saved URL, then scan common LAN IPs for FAMS backend */
async function autoConnectServer(onProgress) {
  const saved = localStorage.getItem(STORAGE_KEYS.serverUrl);
  if (saved) {
    try {
      await testConnection();
      return getServerUrl();
    } catch {
      /* fall through to discovery */
    }
  }
  if (!window.famsDiscovery?.discoverServerOnLan) {
    throw new Error('Enter your laptop IP in Connect below (e.g. 192.168.1.5:3007)');
  }
  const found = await window.famsDiscovery.discoverServerOnLan(onProgress);
  if (!found) throw new Error('No FAMS server on this Wi‑Fi. Start the laptop app and try again.');
  setServerUrl(found);
  return found;
}

/** Pull workers + faces from laptop server into local caches */
async function pullServerData() {
  const pack = await famsFetch('/terminals/sync-pack');
  if (pack?.settings) {
    localStorage.setItem('fams_server_settings', JSON.stringify(pack.settings));
    applyMobileSettings(pack.settings);
  }
  if (pack.workers && window.famsQueue?.setWorkersCache) {
    window.famsQueue.setWorkersCache(pack.workers);
  }
  if (pack.faces && window.famsFaceCache?.saveFaces) {
    await window.famsFaceCache.saveFaces(pack.faces);
  }
  localStorage.setItem('fams_last_pull', new Date().toISOString());
  return pack;
}

function applyMobileSettings(settings) {
  if (!settings) return;
  const syncSec = Number(settings.mobile_sync_interval_sec || 120);
  const hbSec = Number(settings.mobile_heartbeat_interval_sec || 60);
  if (window.famsSync?.startSyncManager) {
    window.famsSync.startSyncManager(syncSec * 1000);
  }
  if (window.famsApi?.restartHeartbeat) {
    window.famsApi.restartHeartbeat(hbSec * 1000);
  }
  window.__famsMobileSettings = settings;
}

async function fullSync() {
  let pull = null;
  let pullError = null;
  try {
    pull = await pullServerData();
  } catch (err) {
    pullError = err.message;
  }
  let push = { merged: 0, skipped: 0, failed: 0, remaining: window.famsQueue?.getPendingCount?.() ?? 0 };
  if (window.famsQueue?.getPendingCount?.() > 0) {
    push = await syncOfflineQueue();
  }
  if (pullError && push.merged === 0 && push.remaining > 0) {
    throw new Error(pullError);
  }
  return { pull, push, pullError };
}

async function loginSupervisor(username, password) {
  const data = await famsFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (data?.token) {
    localStorage.setItem(STORAGE_KEYS.supervisorToken, data.token);
    localStorage.setItem(STORAGE_KEYS.supervisorUser, JSON.stringify(data.user));
  }
  return data;
}

function logoutSupervisor() {
  localStorage.removeItem(STORAGE_KEYS.supervisorToken);
  localStorage.removeItem(STORAGE_KEYS.supervisorUser);
}

function unpairTerminal() {
  localStorage.removeItem(STORAGE_KEYS.terminalToken);
  localStorage.removeItem(STORAGE_KEYS.terminalId);
  localStorage.removeItem(STORAGE_KEYS.terminalName);
  stopHeartbeat();
}

function clearSession() {
  logoutSupervisor();
  unpairTerminal();
}

function getSupervisorUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.supervisorUser) || 'null');
  } catch {
    return null;
  }
}

function getTerminalInfo() {
  return {
    id: localStorage.getItem(STORAGE_KEYS.terminalId),
    name: localStorage.getItem(STORAGE_KEYS.terminalName) || 'Mobile Terminal',
  };
}

async function pairTerminal(pairingCode, name) {
  const res = await famsFetch('/terminals/register', {
    method: 'POST',
    body: JSON.stringify({
      pairingCode,
      name: name || `Floor Device ${getDeviceId().slice(-6)}`,
      deviceModel: navigator.userAgent.includes('Android') ? 'Android' : 'Mobile',
      ipAddress: 'local',
    }),
  });

  localStorage.setItem(STORAGE_KEYS.terminalToken, res.token);
  localStorage.setItem(STORAGE_KEYS.terminalId, res.terminalId);
  localStorage.setItem(STORAGE_KEYS.terminalName, res.name);
  startHeartbeat();
  return res;
}

async function getDashboardStats() {
  const data = await famsFetch('/dashboard');
  return {
    presentCount: data.kpi?.present ?? 0,
    breakCount: data.kpi?.onBreak ?? 0,
    absentCount: data.kpi?.absent ?? 0,
    totalWorkers: data.kpi?.total ?? 0,
  };
}

async function getLiveAttendance() {
  return famsFetch('/attendance/live');
}

async function getTerminals() {
  return famsFetch('/terminals');
}

let heartbeatInterval = null;

function startHeartbeat(intervalMs = 30000) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, intervalMs);
}

function restartHeartbeat(intervalMs = 30000) {
  startHeartbeat(intervalMs);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function sendHeartbeat() {
  if (!isPaired()) return;
  const pendingQueueSize = window.famsQueue?.getPendingCount?.() ?? 0;
  try {
    await famsFetch('/terminals/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        status: 'active',
        batteryLevel: 95,
        isCharging: true,
        networkStrength: 'strong',
        lastSyncTime: new Date().toISOString(),
        pendingQueueSize,
      }),
    });
  } catch (err) {
    console.warn('Heartbeat failed:', err.message);
  }
}

function updatePendingHeartbeat() {
  sendHeartbeat();
}

function isNetworkError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('cannot reach') || msg.includes('failed to fetch') || msg.includes('network');
}

async function refreshWorkerCache() {
  try {
    const workers = await famsFetch('/workers');
    if (window.famsQueue?.setWorkersCache) {
      window.famsQueue.setWorkersCache(workers);
    }
    return workers;
  } catch (err) {
    console.warn('Worker cache refresh failed:', err.message);
    return window.famsQueue?.getWorkersCache?.() || [];
  }
}

async function refreshFaceCache() {
  try {
    const faces = await famsFetch('/workers/faces');
    const normalized = (Array.isArray(faces) ? faces : []).map(f => ({
      employeeCode: f.employeeCode || f.workerId,
      name: f.name,
      descriptor: f.descriptor,
    }));
    if (window.famsFaceCache?.saveFaces) {
      await window.famsFaceCache.saveFaces(normalized);
    }
    return normalized;
  } catch (err) {
    console.warn('Face cache refresh failed:', err.message);
    return window.famsFaceCache?.getAllFaces?.() || [];
  }
}

/**
 * Kiosk attendance: always records WHO + exact WHEN locally, then syncs to server when online.
 */
async function recordKioskAttendance({ employeeCode, workerName, confidence, scannedAt, snapshotThumb }) {
  const timestamp = scannedAt || new Date().toISOString();
  const name = workerName || window.famsQueue?.findWorkerName(employeeCode) || employeeCode;

  const item = window.famsQueue.enqueue({
    employeeCode,
    workerName: name,
    eventType: 'auto',
    method: 'face',
    confidence,
    timestamp,
    snapshotThumb,
  });

  let syncedNow = false;
  try {
    if (await (window.famsSync?.probeServer?.() ?? false)) {
      await famsFetch('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode,
          eventType: 'auto',
          method: 'face',
          confidence,
          clientEventId: item.clientEventId,
          occurredAt: timestamp,
        }),
      });
      window.famsQueue.removeByLocalIds([item.localId]);
      syncedNow = true;
    }
  } catch {
    /* stays in queue — bulk-sync later with original timestamp */
  }

  updatePendingHeartbeat();
  return { item, timestamp, workerName: name, syncedNow };
}

async function logAttendance({ employeeCode, workerName, eventType = 'auto', method = 'mobile_scan', confidence, timestamp, snapshotThumb }) {
  const clientEventId = window.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = { employeeCode, eventType, method, confidence, clientEventId, occurredAt: timestamp || new Date().toISOString() };
  try {
    const result = await famsFetch('/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { online: true, result };
  } catch (err) {
    if (isNetworkError(err) && window.famsQueue) {
      const item = window.famsQueue.enqueue({
        employeeCode,
        workerName: workerName || window.famsQueue.findWorkerName(employeeCode),
        eventType,
        method,
        confidence,
        timestamp,
        snapshotThumb,
        clientEventId,
      });
      return { online: false, queued: true, item };
    }
    throw err;
  }
}

async function syncOfflineQueue() {
  if (!window.famsQueue) throw new Error('Offline queue not loaded');
  const pending = window.famsQueue.getPendingEvents();
  if (!pending.length) {
    return { merged: 0, skipped: 0, failed: 0, remaining: 0 };
  }

  const terminal = getTerminalInfo();
  const events = pending.map(e => ({
    employeeCode: e.employeeCode,
    eventType: e.eventType,
    method: e.method,
    confidence: e.confidence,
    timestamp: e.timestamp,
    occurredAt: e.timestamp,
    clientEventId: e.clientEventId,
    deviceSequence: e.deviceSequence,
  }));

  const result = await famsFetch('/attendance/bulk-sync', {
    method: 'POST',
    body: JSON.stringify({
      terminalId: terminal.id,
      events,
    }),
  });

  const toRemove = [];
  (result.results || []).forEach((r) => {
    const local = pending.find((item) => item.clientEventId === r.clientEventId);
    if (!local) return;
    if (r.status === 'merged' || r.status === 'skipped') {
      toRemove.push(local.localId);
    }
  });

  if (toRemove.length) {
    window.famsQueue.removeByLocalIds(toRemove);
  }

  localStorage.setItem('fams_last_sync', new Date().toISOString());
  if (window.famsQueue.getPendingCount() === 0) {
    localStorage.setItem('fams_synced_state', 'true');
  } else {
    localStorage.removeItem('fams_synced_state');
  }

  updatePendingHeartbeat();

  return {
    ...result,
    remaining: window.famsQueue.getPendingCount(),
  };
}

function getPendingCount() {
  return window.famsQueue?.getPendingCount?.() ?? 0;
}

function routeToHome() {
  // Main app is always index.html — face scan first screen
  if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
    window.location.href = '/index.html';
  }
}

function requireAuth(fallback) {
  if (!isAuthenticated()) {
    if (fallback) window.location.href = fallback;
    return false;
  }
  return true;
}

if (isPaired()) startHeartbeat();

window.famsApi = {
  STORAGE_KEYS,
  getServerUrl,
  setServerUrl,
  getApiBase,
  getDeviceId,
  famsFetch,
  testConnection,
  autoConnectServer,
  isPaired,
  isSupervisorLoggedIn,
  isAuthenticated,
  hasServerConfigured,
  loginSupervisor,
  logoutSupervisor,
  unpairTerminal,
  clearSession,
  getSupervisorUser,
  getTerminalInfo,
  pairTerminal,
  getDashboardStats,
  getLiveAttendance,
  getTerminals,
  startHeartbeat,
  restartHeartbeat,
  stopHeartbeat,
  updatePendingHeartbeat,
  refreshWorkerCache,
  refreshFaceCache,
  pullServerData,
  fullSync,
  recordKioskAttendance,
  logAttendance,
  syncOfflineQueue,
  getPendingCount,
  routeToHome,
  requireAuth,
};
