// Lightweight sync — no background Wi‑Fi scan, pauses while face AI runs

let syncTimer = null;
let syncing = false;
let lastSyncError = null;
let lastPullAt = 0;
const SYNC_INTERVAL_MS = 120_000;
const PULL_EVERY_MS = 300_000;

async function probeServer() {
  try {
    if (!window.famsApi.hasServerConfigured()) return false;
    const url = window.famsApi.getServerUrl();
    if (/localhost|127\.0\.0\.1/i.test(url)) return false;
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function runSyncCycle() {
  if (syncing) return;
  if (window.KioskEngine?.isBusy?.()) return;

  const online = await probeServer();
  if (!online) {
    lastSyncError = 'Offline — scans saved on phone';
    window.dispatchEvent(new CustomEvent('fams-connection-changed', {
      detail: { online: false, error: lastSyncError },
    }));
    return;
  }

  if (!window.famsApi?.isPaired?.()) {
    window.dispatchEvent(new CustomEvent('fams-connection-changed', {
      detail: { online: true, paired: false, message: 'Enter terminal code to sync' },
    }));
    return;
  }

  syncing = true;
  try {
    const pending = window.famsQueue?.getPendingCount?.() ?? 0;
    const shouldPull = Date.now() - lastPullAt > PULL_EVERY_MS;

    let pack = null;
    if (shouldPull) {
      pack = await window.famsApi.pullServerData();
      lastPullAt = Date.now();
      window.dispatchEvent(new CustomEvent('fams-data-pulled', { detail: pack }));
      if (window.KioskEngine?.buildMatcher) {
        await window.KioskEngine.buildMatcher();
      }
    }

    if (pending > 0) {
      const result = await window.famsApi.syncOfflineQueue();
      if ((result.merged || 0) > 0 && window.famsUi?.showToast) {
        window.famsUi.showToast(`Uploaded ${result.merged} attendance record(s)`, 'success');
      }
      window.dispatchEvent(new CustomEvent('fams-sync-complete', { detail: result }));
    }

    lastSyncError = null;
    window.dispatchEvent(new CustomEvent('fams-connection-changed', {
      detail: {
        online: true,
        paired: true,
        workerCount: pack?.workerCount,
        faceCount: pack?.faceCount,
      },
    }));
  } catch (err) {
    lastSyncError = err.message || 'Sync failed';
    console.warn('Sync cycle failed:', lastSyncError);
    window.dispatchEvent(new CustomEvent('fams-connection-changed', {
      detail: { online: false, error: lastSyncError },
    }));
  } finally {
    syncing = false;
  }
}

function startSyncManager(intervalMs = SYNC_INTERVAL_MS) {
  if (syncTimer) clearInterval(syncTimer);
  setTimeout(runSyncCycle, 8000);
  syncTimer = setInterval(runSyncCycle, intervalMs);
}

function stopSyncManager() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function getLastSyncError() {
  return lastSyncError;
}

window.famsSync = {
  startSyncManager,
  stopSyncManager,
  runSyncCycle,
  probeServer,
  getLastSyncError,
};
