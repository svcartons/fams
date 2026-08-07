/**
 * Offline face kiosk — optimized for low-end Android (TinyFaceDetector, throttled loop).
 */

const KioskEngine = (function () {
  let faceMatcher = null;
  let threshold = 0.6;
  let scanTimer = null;
  let lastScan = null;
  let running = false;
  let modelsReady = false;
  let inferBusy = false;
  let nameByCode = {};

  const FACE_DESCRIPTOR_LENGTH = 128;
  const SCAN_GAP_MS = 2800;
  const COOLDOWN_MS = 12000;

  const detectorOptions = () =>
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

  function formatScanTime(iso) {
    return new Date(iso).toLocaleString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  }

  async function initTfBackend() {
    const tf = faceapi.tf || window.tf;
    if (!tf?.setBackend) return;
    for (const backend of ['webgl', 'cpu']) {
      try {
        const ok = await tf.setBackend(backend);
        if (ok) {
          await tf.ready();
          return;
        }
      } catch {
        /* try next backend */
      }
    }
  }

  async function loadModels() {
    await window.famsModelLoader.ensureModels();
    const base = window.famsModelLoader.resolveModelBase();
    await faceapi.nets.tinyFaceDetector.loadFromUri(base);
    await faceapi.nets.faceLandmark68Net.loadFromUri(base);
    await faceapi.nets.faceRecognitionNet.loadFromUri(base);
    modelsReady = true;
  }

  function normalizeDescriptor(raw) {
    if (!raw) return null;
    const arr = raw instanceof Float32Array ? raw : Array.isArray(raw) ? new Float32Array(raw) : null;
    if (!arr || arr.length !== FACE_DESCRIPTOR_LENGTH) return null;
    return arr;
  }

  async function buildMatcher() {
    const faces = await window.famsFaceCache.getAllFaces();
    const labeled = [];
    nameByCode = {};
    for (const f of faces) {
      const desc = normalizeDescriptor(f.descriptor);
      if (!desc) continue;
      labeled.push(new faceapi.LabeledFaceDescriptors(f.employeeCode, [desc]));
      nameByCode[f.employeeCode] = f.name || f.employeeCode;
    }
    faceMatcher = labeled.length ? new faceapi.FaceMatcher(labeled, threshold) : null;
    return labeled.length;
  }

  async function initialize() {
    await initTfBackend();
    await loadModels();
    try {
      const settings = await window.famsApi.famsFetch('/settings');
      if (settings?.ai_threshold) threshold = parseFloat(settings.ai_threshold) || 0.6;
    } catch {
      /* offline */
    }
    return buildMatcher();
  }

  function stopScanning() {
    running = false;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
  }

  function isBusy() {
    return inferBusy;
  }

  function scheduleNextScan(fn) {
    scanTimer = setTimeout(fn, SCAN_GAP_MS);
  }

  function startScanning(videoEl, callbacks) {
    stopScanning();
    if (!modelsReady) {
      callbacks.onError?.('Face models still loading…');
      return;
    }
    if (!faceMatcher || !videoEl) {
      callbacks.onError?.('No enrolled faces. Connect and sync once.');
      return;
    }
    running = true;
    callbacks.onStatus?.('scanning', 'Face the camera');

    async function tick() {
      if (!running) return;

      if (!inferBusy && videoEl.readyState >= 2) {
        inferBusy = true;
        try {
          const detection = await faceapi
            .detectSingleFace(videoEl, detectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection && faceMatcher) {
            const match = faceMatcher.findBestMatch(detection.descriptor);
            if (match.label !== 'unknown') {
              const now = Date.now();
              if (!lastScan || lastScan.employeeCode !== match.label || now - lastScan.time >= COOLDOWN_MS) {
                lastScan = { employeeCode: match.label, time: now };
                const confidence = Math.round((1 - match.distance) * 100);
                const scannedAt = new Date().toISOString();
                const displayName = nameByCode[match.label] || window.famsQueue.findWorkerName(match.label);

                callbacks.onStatus?.('processing', `Recognized ${displayName}…`);

                const record = await window.famsApi.recordKioskAttendance({
                  employeeCode: match.label,
                  workerName: displayName,
                  confidence,
                  scannedAt,
                });

                callbacks.onSuccess?.({
                  employeeCode: match.label,
                  workerName: displayName,
                  confidence,
                  scannedAt,
                  formattedTime: formatScanTime(scannedAt),
                  syncedNow: record.syncedNow,
                  pendingTotal: window.famsApi.getPendingCount(),
                });

                setTimeout(() => {
                  if (running) callbacks.onStatus?.('scanning', 'Face the camera');
                }, 3000);
              }
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          inferBusy = false;
        }
      }

      scheduleNextScan(tick);
    }

    scheduleNextScan(tick);
  }

  return {
    initialize,
    buildMatcher,
    startScanning,
    stopScanning,
    isBusy,
    formatScanTime,
    reloadModels: loadModels,
    get faceCount() {
      return faceMatcher ? faceMatcher.labeledDescriptors.length : 0;
    },
  };
})();

window.KioskEngine = KioskEngine;
