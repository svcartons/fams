/**
 * FAMS Mobile — main app shell: face scan home, menu, connect panel, offline sync
 */

(function () {
  let videoStream = null;
  let connectOpen = true;
  let currentView = 'scan';

  function $(id) { return document.getElementById(id); }

  function setBoot(msg, hide) {
    const boot = $('boot');
    $('boot-msg').textContent = msg;
    if (hide) boot.classList.add('hidden');
  }

  function updateQueueBadge() {
    const n = window.famsApi.getPendingCount();
    const el = $('queue-badge');
    el.textContent = n ? `${n} pending sync` : 'All synced';
    el.className = n ? 'badge' : 'badge ok';
  }

  function updateFacesBadge(count) {
    const el = $('faces-badge');
    el.textContent = `${count ?? 0} faces`;
    el.className = count > 0 ? 'badge ok' : 'badge';
  }

  function setStatusBar(online, paired, detail) {
    const bar = $('status-bar');
    if (!online) {
      bar.className = 'status-bar offline';
      bar.textContent = detail?.error || 'Offline — scans saved on phone, sync when Wi‑Fi connects';
      return;
    }
    if (!paired) {
      bar.className = 'status-bar partial';
      bar.textContent = 'Server reachable — enter terminal code below to sync';
      return;
    }
    bar.className = 'status-bar online';
    const host = window.famsApi.getServerUrl().replace(/^https?:\/\//, '');
    bar.textContent = `Connected · ${detail?.faceCount ?? '—'} faces · ${host} · ${window.famsApi.getPendingCount()} pending`;
  }

  function showSuccess(data) {
    const panel = $('success-panel');
    $('success-name').textContent = data.workerName;
    $('success-meta').textContent = `${data.employeeCode} · ${data.formattedTime} · ${data.syncedNow ? 'Sent to server' : 'Saved offline'}`;
    panel.classList.add('show');
    setTimeout(() => panel.classList.remove('show'), 4000);
    updateQueueBadge();
  }

  async function startCamera() {
    const video = $('video');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640, max: 640 },
            height: { ideal: 480, max: 480 },
            frameRate: { ideal: 15, max: 20 },
          },
          audio: false,
        });
      video.srcObject = videoStream;
      await video.play();
    } catch {
      $('scan-status').textContent = 'Allow camera access to scan faces';
      throw new Error('Camera permission required');
    }
  }

  function switchView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('view-' + name).classList.add('active');
    document.querySelectorAll('.menu-dropdown button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    $('menu-dropdown').classList.remove('open');
    if (name === 'employees') renderEmployeeList();
    if (name === 'settings') renderSettings();
  }

  function renderEmployeeList() {
    const list = $('employee-list');
    const workers = window.famsQueue.getWorkersCache();
    if (!workers.length) {
      list.innerHTML = '<div class="empty-state">No employees on device yet.<br>Connect to server and tap Pair &amp; sync.</div>';
      return;
    }
    list.innerHTML = workers.map(w => `
      <div class="worker-row">
        <div class="avatar">${window.famsUi.initialsAvatar(w.name)}</div>
        <div>
          <div class="worker-name">${escapeHtml(w.name)}</div>
          <div class="worker-code">${escapeHtml(w.employeeCode)}${w.department ? ' · ' + escapeHtml(w.department) : ''}</div>
        </div>
      </div>
    `).join('');
  }

  function renderSettings() {
    const host = window.famsApi.getServerUrl().replace(/^https?:\/\//, '');
    const term = window.famsApi.getTerminalInfo();
    const pending = window.famsApi.getPendingCount();
    const lastSync = localStorage.getItem('fams_last_sync') || 'Never';
    const lastPull = localStorage.getItem('fams_last_pull') || 'Never';

    $('settings-connection').innerHTML = `
      <div class="row"><span class="label">Server</span><span>${escapeHtml(host)}</span></div>
      <div class="row"><span class="label">Paired</span><span>${window.famsApi.isPaired() ? 'Yes' : 'No'}</span></div>
      <div class="row"><span class="label">Last pull</span><span>${escapeHtml(lastPull)}</span></div>
    `;
    $('settings-terminal').innerHTML = `
      <div class="row"><span class="label">Name</span><span>${escapeHtml(term.name || '—')}</span></div>
      <div class="row"><span class="label">Device ID</span><span style="font-size:10px;font-family:monospace">${escapeHtml(window.famsApi.getDeviceId())}</span></div>
    `;
    $('settings-queue').innerHTML = `
      <div class="row"><span class="label">Pending scans</span><span>${pending}</span></div>
      <div class="row"><span class="label">Last upload</span><span>${escapeHtml(lastSync)}</span></div>
    `;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function setConnectOpen(open) {
    connectOpen = open;
    $('connect-body').classList.toggle('open', open);
    $('connect-chevron').textContent = open ? '▲' : '▼';
  }

  function updateConnectToggleLabel() {
    const paired = window.famsApi.isPaired();
    const label = $('connect-toggle-label');
    if (paired) {
      label.textContent = window.famsApi.getTerminalInfo().name + ' · tap to manage connection';
    } else {
      label.textContent = 'Connect to server — tap to expand';
    }
  }

  async function tryLoadFaceModels() {
    setBoot('Loading face recognition models…');
    try {
      const faceCount = await KioskEngine.initialize();
      updateFacesBadge(faceCount);
      return { ok: true, faceCount };
    } catch (e) {
      console.error(e);
      $('scan-status').textContent = e.message || 'Models not loaded';
      setConnectOpen(true);
      return { ok: false, error: e.message };
    }
  }

  async function afterServerConnected() {
    if (!window.famsModelLoader?.syncFromServer) return;
    $('scan-status').textContent = 'Downloading AI models from laptop…';
    const got = await window.famsModelLoader.syncFromServer();
    if (got) {
      await KioskEngine.reloadModels();
      window.famsUi.showToast('AI models saved on phone (works offline now)', 'success');
    }
  }

  async function handleTestServer() {
    const raw = $('server-input').value.trim();
    if (!raw) {
      window.famsUi.showToast('Enter laptop IP address', 'error');
      return;
    }
    try {
      window.famsApi.setServerUrl(raw);
      await window.famsApi.testConnection();
      window.famsUi.showToast('Server is reachable', 'success');
      setStatusBar(true, window.famsApi.isPaired(), {});
      await afterServerConnected();
      const load = await tryLoadFaceModels();
      if (load.ok) setBoot('', true);
    } catch (e) {
      window.famsUi.showToast(e.message, 'error');
    }
  }

  async function handleFindWifi() {
    const btn = $('btn-find-wifi');
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    try {
      const found = await window.famsApi.autoConnectServer((p) => {
        btn.textContent = p.message?.slice(0, 20) || 'Scanning…';
      });
      $('server-input').value = found.replace(/^https?:\/\//, '');
      window.famsUi.showToast('Found server: ' + found.replace(/^https?:\/\//, ''), 'success');
      setStatusBar(true, window.famsApi.isPaired(), {});
      await afterServerConnected();
      await tryLoadFaceModels();
      if (window.famsApi.isPaired()) await handleSyncNow();
    } catch (e) {
      window.famsUi.showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Find on Wi‑Fi';
    }
  }

  async function handlePair() {
    const code = $('otp-input').value.trim();
    if (code.length !== 6) {
      window.famsUi.showToast('Enter the 6-digit code from laptop', 'error');
      return;
    }
    const raw = $('server-input').value.trim();
    if (raw) window.famsApi.setServerUrl(raw);

    const btn = $('btn-pair');
    btn.disabled = true;
    btn.textContent = 'Pairing…';
    try {
      await window.famsApi.testConnection();
      await window.famsApi.pairTerminal(code);
      window.famsUi.showToast('Terminal paired', 'success');
      updateConnectToggleLabel();
      await afterServerConnected();
      const load = await tryLoadFaceModels();
      await handleSyncNow();
      if (load.ok && load.faceCount > 0) {
        KioskEngine.startScanning($('video'), scanCallbacks);
      }
      setConnectOpen(false);
    } catch (e) {
      window.famsUi.showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Pair & sync';
    }
  }

  async function handleSyncNow() {
    $('scan-status').textContent = 'Syncing…';
    KioskEngine.stopScanning();
    try {
      const r = await window.famsApi.fullSync();
      const faces = r.pull?.faceCount ?? 0;
      const merged = r.push?.merged ?? 0;
      if (window.KioskEngine) {
        const n = await KioskEngine.buildMatcher();
        updateFacesBadge(n);
        if (n > 0 && currentView === 'scan') {
          KioskEngine.startScanning($('video'), scanCallbacks);
        }
      }
      window.famsUi.showToast(`Pulled ${faces} faces · uploaded ${merged} scans`, 'success');
      setStatusBar(true, true, r.pull || {});
      updateQueueBadge();
      renderEmployeeList();
    } catch (e) {
      window.famsUi.showToast(e.message, 'error');
      const online = await window.famsSync.probeServer();
      setStatusBar(online, window.famsApi.isPaired(), { error: e.message });
    }
    $('scan-status').textContent = 'Face the camera';
    if (currentView === 'scan' && KioskEngine.faceCount > 0) {
      KioskEngine.startScanning($('video'), scanCallbacks);
    }
  }

  const scanCallbacks = {
    onStatus: (_s, msg) => { if (currentView === 'scan') $('scan-status').textContent = msg; },
    onSuccess: (data) => showSuccess(data),
    onError: (msg) => { if (currentView === 'scan') $('scan-status').textContent = msg; },
  };

  async function initApp() {
    $('server-input').value = window.famsApi.getServerUrl().replace(/^https?:\/\//, '');
    updateConnectToggleLabel();
    updateQueueBadge();
    setConnectOpen(!window.famsApi.isPaired());

    window.addEventListener('fams-queue-changed', updateQueueBadge);
    window.addEventListener('fams-sync-complete', updateQueueBadge);
    window.addEventListener('fams-connection-changed', (e) => {
      const d = e.detail || {};
      setStatusBar(d.online !== false, d.paired !== false && window.famsApi.isPaired(), d);
      if (d.faceCount != null) updateFacesBadge(d.faceCount);
    });
    window.addEventListener('fams-data-pulled', (e) => {
      updateFacesBadge(e.detail?.faceCount);
      renderEmployeeList();
    });

    window.famsSync.startSyncManager();

    setBoot('Starting camera…');
    try {
      await startCamera();
    } catch (e) {
      setBoot(e.message, false);
      return;
    }

    const load = await tryLoadFaceModels();
    setBoot('', true);

    let faceCount = load.ok ? load.faceCount : 0;
    if (faceCount > 0) {
      KioskEngine.startScanning($('video'), scanCallbacks);
    } else if (load.ok) {
      $('scan-status').textContent = 'Connect to server to download employee faces';
      setConnectOpen(true);
    }

    if (window.famsApi.isPaired()) {
      window.famsSync.runSyncCycle().then(() => {
        KioskEngine.buildMatcher().then(n => {
          updateFacesBadge(n);
          if (n > 0) KioskEngine.startScanning($('video'), scanCallbacks);
        });
      });
    } else {
      window.famsSync.probeServer().then(online => {
        setStatusBar(online, false, {});
        if (online && !localStorage.getItem('fams_server_url')) {
          window.famsApi.autoConnectServer().then(url => {
            $('server-input').value = url.replace(/^https?:\/\//, '');
          }).catch(() => {});
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('menu-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => $('menu-dropdown').classList.remove('open'));
    $('menu-dropdown').addEventListener('click', (e) => e.stopPropagation());

    document.querySelectorAll('.menu-dropdown button').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    $('connect-toggle').addEventListener('click', () => setConnectOpen(!connectOpen));

    $('btn-test-server').addEventListener('click', handleTestServer);
    $('btn-find-wifi').addEventListener('click', handleFindWifi);
    $('btn-pair').addEventListener('click', handlePair);
    $('btn-sync-now').addEventListener('click', handleSyncNow);
    $('btn-settings-sync').addEventListener('click', handleSyncNow);
    $('btn-unpair').addEventListener('click', () => {
      if (confirm('Unpair this device? You will need a new code to sync again.')) {
        window.famsApi.unpairTerminal();
        updateConnectToggleLabel();
        setConnectOpen(true);
        setStatusBar(false, false, {});
        window.famsUi.showToast('Terminal unpaired', 'info');
        renderSettings();
      }
    });

    initApp();
  });

  window.addEventListener('beforeunload', () => {
    KioskEngine.stopScanning();
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
  });
})();
