import { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import {
  CheckCircle,
  XCircle,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';
import {
  getFaceDescriptors,
  logAttendance,
  getSettings,
  getGoogleClientId,
  kioskGooglePair,
  bulkSyncAttendance,
  type SystemSettings,
} from '../../api/client';
import {
  bootstrapKioskToken,
  ensureKioskToken,
  setStoredKioskToken,
  clearStoredKioskToken,
} from '../utils/kioskToken';
import {
  enqueueOfflinePunch,
  getPendingCount,
  getQueuedEvents,
  removeQueuedByClientEventIds,
} from '../utils/kioskOfflineQueue';
import { assessFaceQuality } from '../utils/faceQuality';

const cameraConstraints: Record<string, MediaTrackConstraints> = {
  '480p': { width: { ideal: 640 }, height: { ideal: 480 } },
  '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
  '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
};

const FACE_REFRESH_MS = 7 * 60 * 1000;
const QUEUE_SYNC_POLL_MS = 45_000;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector('script[data-google-gsi]') as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

function isAuthFailure(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 401 || status === 403;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type KioskStatus =
  | 'pairing'
  | 'loading'
  | 'scanning'
  | 'processing'
  | 'idle'
  | 'empty_roster'
  | 'success'
  | 'offline'
  | 'duplicate'
  | 'multiface'
  | 'error';

type KioskRuntimeSettings = {
  threshold: number;
  scanIntervalMs: number;
  idleTimeoutSec: number;
  cameraRes: string;
  offlineMode: boolean;
  useLandmarks: boolean;
  useTinyDetector: boolean;
  multifaceAlert: boolean;
  autoRetry: number;
};

const defaultRuntime: KioskRuntimeSettings = {
  threshold: 0.55,
  scanIntervalMs: 800,
  idleTimeoutSec: 30,
  cameraRes: '720p',
  offlineMode: false,
  useLandmarks: true,
  useTinyDetector: false,
  multifaceAlert: true,
  autoRetry: 3,
};

function parseRuntimeSettings(settings: Partial<SystemSettings>): KioskRuntimeSettings {
  return {
    threshold: parseFloat(settings.ai_threshold || '0.55') || 0.55,
    scanIntervalMs: Number(settings.ai_scan_interval || 800) || 800,
    idleTimeoutSec: Number(settings.kiosk_idle_timeout || 30) || 30,
    cameraRes: settings.kiosk_camera_res || '720p',
    offlineMode: settings.kiosk_offline_mode === 'true',
    useLandmarks: true, // always on for accurate alignment
    useTinyDetector: settings.ai_model === 'tiny_face',
    multifaceAlert: settings.ai_multiface_alert !== 'false',
    autoRetry: Math.max(0, Number(settings.ai_auto_retry || 3) || 0),
  };
}

function formatClock(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function KioskMode() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());
  const pausedByVisibilityRef = useRef(false);
  const scanningActiveRef = useRef(false);
  const runtimeRef = useRef<KioskRuntimeSettings>(defaultRuntime);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const nameByCodeRef = useRef<Map<string, string>>(new Map());
  const lastScanRef = useRef<{ employeeCode: string; time: number } | null>(null);
  const pendingConfirmRef = useRef<{ employeeCode: string; count: number; at: number } | null>(null);
  const qualityHintAtRef = useRef(0);
  const resetTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const statusRef = useRef<KioskStatus>('loading');
  const initStartedRef = useRef(false);

  const [status, setStatus] = useState<KioskStatus>('loading');
  const [message, setMessage] = useState('Loading…');
  const [workerName, setWorkerName] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [googleConfigError, setGoogleConfigError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<KioskRuntimeSettings>(defaultRuntime);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  const scheduleReset = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    resetTimersRef.current.push(id);
  }, []);

  useEffect(
    () => () => {
      resetTimersRef.current.forEach(clearTimeout);
      resetTimersRef.current = [];
    },
    []
  );

  const refreshPendingCount = useCallback(async () => {
    try {
      setPendingCount(await getPendingCount());
    } catch {
      /* ignore */
    }
  }, []);

  const stopScanLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    scanningActiveRef.current = false;
  }, []);

  const stopCameraAndScan = useCallback(() => {
    stopScanLoop();
    if (idleCheckRef.current) {
      clearInterval(idleCheckRef.current);
      idleCheckRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopScanLoop]);

  const forceRePair = useCallback(
    (reason: string) => {
      clearStoredKioskToken();
      stopCameraAndScan();
      setCameraReady(false);
      setStatus('pairing');
      setMessage('An administrator must unlock this device');
      setPairError(reason);
    },
    [stopCameraAndScan]
  );

  const enterIdle = useCallback(
    (fromVisibility: boolean) => {
      pausedByVisibilityRef.current = fromVisibility;
      stopCameraAndScan();
      setCameraReady(false);
      setStatus('idle');
      setMessage('Tap to resume');
    },
    [stopCameraAndScan]
  );

  const buildMatcher = useCallback(
    (
      descriptors: Array<{
        employeeCode: string;
        name: string;
        descriptor: number[];
        descriptors?: number[][];
      }>,
      threshold: number
    ) => {
      const names = new Map<string, string>();
      const labeled = descriptors
        .map((d) => {
          names.set(d.employeeCode, d.name);
          const vectors = (d.descriptors && d.descriptors.length > 0
            ? d.descriptors
            : d.descriptor
              ? [d.descriptor]
              : []
          ).filter((v) => Array.isArray(v) && v.length === 128);
          if (vectors.length === 0) return null;
          return new faceapi.LabeledFaceDescriptors(
            d.employeeCode,
            vectors.map((v) => new Float32Array(v)),
          );
        })
        .filter((x): x is faceapi.LabeledFaceDescriptors => !!x);
      nameByCodeRef.current = names;
      const matcher = new faceapi.FaceMatcher(labeled, threshold);
      faceMatcherRef.current = matcher;
      return matcher;
    },
    []
  );

  const loadModels = useCallback(async (useTiny: boolean) => {
    const loads: Promise<void>[] = [
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ];
    if (useTiny) {
      loads.push(faceapi.nets.tinyFaceDetector.loadFromUri('/models'));
    } else {
      loads.push(faceapi.nets.ssdMobilenetv1.loadFromUri('/models'));
    }
    await Promise.all(loads);
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const queued = await getQueuedEvents();
    if (queued.length === 0) {
      setPendingCount(0);
      return;
    }
    try {
      const result = await bulkSyncAttendance(
        queued.map((e) => ({
          employeeCode: e.employeeCode,
          eventType: e.eventType,
          method: e.method,
          confidence: e.confidence,
          timestamp: e.timestamp,
          clientEventId: e.clientEventId,
        }))
      );
      const doneIds = result.results
        .filter((r) => r.status === 'merged' || r.status === 'skipped')
        .map((r) => r.clientEventId)
        .filter((id): id is string => !!id);
      await removeQueuedByClientEventIds(doneIds);
      await refreshPendingCount();
    } catch (err) {
      if (isAuthFailure(err)) {
        forceRePair('Kiosk token was regenerated or revoked. Unlock this device again.');
      }
    }
  }, [forceRePair, refreshPendingCount]);

  const startScanner = useCallback(async () => {
    setStatus('loading');
    setMessage('Starting scanner…');
    setPairError(null);

    try {
      let settings: Partial<SystemSettings>;
      try {
        settings = await getSettings();
      } catch (err) {
        if (isAuthFailure(err)) {
          forceRePair('Kiosk token was regenerated or revoked. Unlock this device again.');
          return;
        }
        settings = { ai_threshold: '0.55', ai_multiface_alert: 'true' };
      }

      ensureKioskToken(settings.sec_kiosk_token);
      const rt = parseRuntimeSettings(settings);
      setRuntime(rt);
      runtimeRef.current = rt;

      await loadModels(rt.useTinyDetector);

      let descriptors: Array<{ employeeCode: string; name: string; descriptor: number[] }>;
      try {
        descriptors = await getFaceDescriptors();
      } catch (err) {
        if (isAuthFailure(err)) {
          forceRePair('Kiosk token was regenerated or revoked. Unlock this device again.');
          return;
        }
        throw err;
      }

      if (descriptors.length === 0) {
        faceMatcherRef.current = null;
        setStatus('empty_roster');
        setMessage('No enrolled faces yet. Ask an admin to register workers, then retry.');
        return;
      }

      buildMatcher(descriptors, rt.threshold);
      await refreshPendingCount();
      if (rt.offlineMode) void syncOfflineQueue();

      lastActivityRef.current = Date.now();
      pausedByVisibilityRef.current = false;
      setStatus('scanning');
      setMessage('Face the camera');
      setCameraReady(true);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not start scanner. Check network and model files.');
    }
  }, [buildMatcher, forceRePair, loadModels, refreshPendingCount, syncOfflineQueue]);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const initialize = async () => {
      try {
        if (ensureKioskToken()) {
          await startScanner();
          return;
        }
        const boot = await bootstrapKioskToken();
        if (boot.ok) {
          await startScanner();
          return;
        }
        setStatus('pairing');
        setMessage('An administrator must unlock this device');
        if (boot.reason === 'forbidden') {
          setPairError(
            'This device is not on the factory LAN. An administrator must unlock it with Google once.'
          );
        } else if (boot.reason === 'network') {
          setPairError('Could not reach the server to auto-pair. Check network, then unlock with Google.');
        }
      } catch (err) {
        console.error(err);
        setStatus('pairing');
        setMessage('An administrator must unlock this device');
        setPairError(err instanceof Error ? err.message : 'Could not pair this kiosk');
      }
    };
    void initialize();
  }, [startScanner]);

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setGoogleLoading(true);
      setPairError(null);
      try {
        const { token } = await kioskGooglePair(credential);
        setStoredKioskToken(token);
        await startScanner();
      } catch (err: any) {
        setPairError(err?.message || 'Google Sign-In failed. Use an authorized admin account.');
      } finally {
        setGoogleLoading(false);
      }
    },
    [startScanner]
  );

  useEffect(() => {
    if (status !== 'pairing') return;
    let cancelled = false;

    (async () => {
      try {
        const { clientId } = await getGoogleClientId();
        if (cancelled) return;
        if (!clientId) {
          setGoogleConfigError(
            'Google Sign-In not configured. Add GOOGLE_CLIENT_ID on the server, then reload.'
          );
          return;
        }
        setGoogleConfigError(null);
        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) void handleGoogleCredential(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: Math.min(googleBtnRef.current.offsetWidth || 320, 360),
          logo_alignment: 'left',
        });
      } catch {
        if (!cancelled) {
          setGoogleConfigError('Unable to load Google Sign-In. Check network and try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, handleGoogleCredential]);

  const postAttendanceWithRetry = useCallback(
    async (payload: {
      employeeCode: string;
      eventType: string;
      method: string;
      confidence: number;
      clientEventId: string;
      occurredAt: string;
    }) => {
      const retries = runtimeRef.current.autoRetry;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await logAttendance(payload);
        } catch (err) {
          lastErr = err;
          if (isAuthFailure(err)) throw err;
          if (attempt < retries) await sleep(400 * (attempt + 1));
        }
      }
      throw lastErr;
    },
    []
  );

  const runDetect = useCallback(async (video: HTMLVideoElement) => {
    const rt = runtimeRef.current;
    const options = rt.useTinyDetector
      ? new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
      : new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

    if (rt.multifaceAlert) {
      const all = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceDescriptors();
      if (all.length > 1) return { kind: 'multiface' as const };
      if (all.length === 0) return { kind: 'none' as const };
      const quality = assessFaceQuality(all[0], video.videoWidth, video.videoHeight, {
        minFaceRatio: 0.16,
        minScore: 0.5,
      });
      if (!quality.ok) return { kind: 'quality' as const, message: quality.message };
      return { kind: 'match' as const, detection: all[0] };
    }

    const detection = await faceapi
      .detectSingleFace(video, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!detection) return { kind: 'none' as const };
    const quality = assessFaceQuality(detection, video.videoWidth, video.videoHeight, {
      minFaceRatio: 0.16,
      minScore: 0.5,
    });
    if (!quality.ok) return { kind: 'quality' as const, message: quality.message };
    return { kind: 'match' as const, detection };
  }, []);

  const startScanLoop = useCallback(() => {
    if (scanningActiveRef.current || intervalRef.current) return;
    scanningActiveRef.current = true;

    intervalRef.current = setInterval(async () => {
      if (statusRef.current !== 'scanning' || !videoRef.current || !faceMatcherRef.current) return;

      try {
        const result = await runDetect(videoRef.current);
        if (result.kind === 'none') {
          pendingConfirmRef.current = null;
          return;
        }

        if (result.kind === 'quality') {
          pendingConfirmRef.current = null;
          const now = Date.now();
          if (now - qualityHintAtRef.current > 2000) {
            qualityHintAtRef.current = now;
            setMessage(result.message);
          }
          return;
        }

        if (result.kind === 'multiface') {
          pendingConfirmRef.current = null;
          lastActivityRef.current = Date.now();
          setStatus('multiface');
          setMessage('One person only — step closer alone');
          scheduleReset(() => {
            setStatus('scanning');
            setMessage('Face the camera');
          }, 2500);
          return;
        }

        lastActivityRef.current = Date.now();
        const bestMatch = faceMatcherRef.current.findBestMatch(result.detection.descriptor);
        if (bestMatch.label === 'unknown') {
          pendingConfirmRef.current = null;
          return;
        }

        const now = Date.now();
        if (
          lastScanRef.current?.employeeCode === bestMatch.label &&
          now - lastScanRef.current.time < 10000
        ) {
          return;
        }

        // Require two consecutive matches of the same worker (~1–1.5s window)
        const pending = pendingConfirmRef.current;
        if (
          pending &&
          pending.employeeCode === bestMatch.label &&
          now - pending.at < 1600
        ) {
          pendingConfirmRef.current = {
            employeeCode: bestMatch.label,
            count: pending.count + 1,
            at: now,
          };
        } else {
          pendingConfirmRef.current = { employeeCode: bestMatch.label, count: 1, at: now };
          setMessage('Hold still…');
          return;
        }

        if ((pendingConfirmRef.current?.count ?? 0) < 2) {
          setMessage('Hold still…');
          return;
        }
        pendingConfirmRef.current = null;

        setStatus('processing');
        lastScanRef.current = { employeeCode: bestMatch.label, time: now };

        const confidence = Math.round((1 - bestMatch.distance) * 100);
        const clientEventId = globalThis.crypto?.randomUUID?.() || `kiosk-${now}`;
        const occurredAt = new Date().toISOString();
        const displayName = nameByCodeRef.current.get(bestMatch.label) || bestMatch.label;

        const queueOffline = async () => {
          await enqueueOfflinePunch({
            clientEventId,
            employeeCode: bestMatch.label,
            workerName: displayName,
            eventType: 'auto',
            method: 'face',
            confidence,
            timestamp: occurredAt,
          });
          await refreshPendingCount();
          setWorkerName(displayName);
          setStatus('offline');
          setMessage('Saved on this device and waiting to sync');
          scheduleReset(() => {
            setStatus('scanning');
            setMessage('Face the camera');
          }, 4000);
        };

        try {
          if (!navigator.onLine && runtimeRef.current.offlineMode) {
            await queueOffline();
            return;
          }

          const response = await postAttendanceWithRetry({
            employeeCode: bestMatch.label,
            eventType: 'auto',
            method: 'face',
            confidence,
            clientEventId,
            occurredAt,
          });

          const event = response.result ?? response;
          const isQueued = response.online === false || response.queued === true;
          setWorkerName(event.worker?.name || displayName);
          const isDuplicate = event.syncStatus === 'duplicate';
          setStatus(isDuplicate ? 'duplicate' : isQueued ? 'offline' : 'success');
          setMessage(
            isDuplicate
              ? 'This scan was already recorded'
              : isQueued
                ? 'Saved on this device and waiting to sync'
                : event.eventType === 'checked-in'
                  ? 'Checked in'
                  : 'Checked out'
          );

          scheduleReset(() => {
            setStatus('scanning');
            setMessage('Face the camera');
          }, 4000);
        } catch (err: any) {
          if (isAuthFailure(err)) {
            forceRePair('Kiosk token was regenerated or revoked. Unlock this device again.');
            return;
          }
          if (runtimeRef.current.offlineMode) {
            await queueOffline();
            return;
          }
          setStatus('error');
          setMessage(err?.message || 'Scan failed');
          scheduleReset(() => {
            setStatus('scanning');
            setMessage('Face the camera');
          }, 4000);
        }
      } catch (err: any) {
        console.error(err);
        setStatus('error');
        setMessage(err?.message || 'Scan failed');
        scheduleReset(() => {
          setStatus('scanning');
          setMessage('Face the camera');
        }, 4000);
      }
    }, runtimeRef.current.scanIntervalMs);
  }, [forceRePair, postAttendanceWithRetry, refreshPendingCount, runDetect, scheduleReset]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setMessage('Camera requires HTTPS (or localhost) and browser permission.');
      return;
    }

    stopCameraAndScan();

    try {
      const constraints = cameraConstraints[runtimeRef.current.cameraRes] || cameraConstraints['720p'];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', ...constraints },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      lastActivityRef.current = Date.now();
      startScanLoop();

      idleCheckRef.current = setInterval(() => {
        if (statusRef.current !== 'scanning' && statusRef.current !== 'processing') return;
        if (Date.now() - lastActivityRef.current > runtimeRef.current.idleTimeoutSec * 1000) {
          enterIdle(false);
        }
      }, 2000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Camera access denied. Allow camera permission and retry.');
    }
  }, [enterIdle, startScanLoop, stopCameraAndScan]);

  // Own the camera only while actively scanning / processing / multiface flash
  useEffect(() => {
    const needsCamera = status === 'scanning' || status === 'processing' || status === 'multiface';
    if (!needsCamera || !cameraReady) return;

    if (!streamRef.current) {
      void startCamera();
    } else if (!scanningActiveRef.current && status === 'scanning') {
      startScanLoop();
    }
  }, [status, cameraReady, startCamera, startScanLoop]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (runtimeRef.current.offlineMode) void syncOfflineQueue();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncOfflineQueue]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (['scanning', 'processing', 'multiface'].includes(statusRef.current)) {
          enterIdle(true);
        }
        return;
      }
      if (statusRef.current === 'idle' && pausedByVisibilityRef.current) {
        pausedByVisibilityRef.current = false;
        setStatus('scanning');
        setMessage('Face the camera');
        setCameraReady(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enterIdle]);

  // Periodic face roster refresh
  useEffect(() => {
    if (!['scanning', 'idle', 'processing', 'success', 'offline', 'duplicate', 'multiface'].includes(status)) {
      return;
    }
    const id = setInterval(async () => {
      try {
        const descriptors = await getFaceDescriptors();
        if (descriptors.length === 0) {
          stopCameraAndScan();
          setCameraReady(false);
          setStatus('empty_roster');
          setMessage('No enrolled faces yet. Ask an admin to register workers, then retry.');
          return;
        }
        buildMatcher(descriptors, runtimeRef.current.threshold);
      } catch (err) {
        if (isAuthFailure(err)) {
          forceRePair('Kiosk token was regenerated or revoked. Unlock this device again.');
        }
      }
    }, FACE_REFRESH_MS);
    return () => clearInterval(id);
  }, [status, buildMatcher, forceRePair, stopCameraAndScan]);

  // Periodic offline sync while active
  useEffect(() => {
    if (!runtime.offlineMode) return;
    if (!['scanning', 'idle', 'processing', 'success', 'offline', 'duplicate'].includes(status)) return;
    const id = setInterval(() => {
      void syncOfflineQueue();
    }, QUEUE_SYNC_POLL_MS);
    return () => clearInterval(id);
  }, [runtime.offlineMode, status, syncOfflineQueue]);

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      stopCameraAndScan();
    },
    [stopCameraAndScan]
  );

  const resumeFromIdle = () => {
    pausedByVisibilityRef.current = false;
    lastActivityRef.current = Date.now();
    setStatus('scanning');
    setMessage('Face the camera');
    setCameraReady(true);
  };

  const chrome = (
    <header className="fams-kiosk-chrome">
      <div className="fams-kiosk-chrome-brand">
        <span className="fams-kiosk-chrome-title">FAMS</span>
        <span className="fams-kiosk-chrome-sub">Floor kiosk</span>
      </div>
      <div className="fams-kiosk-chrome-meta">
        <span className="fams-kiosk-clock">{clock}</span>
        <span className={`fams-kiosk-badge ${online ? 'is-online' : 'is-offline'}`}>
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {online ? 'Online' : 'Offline'}
        </span>
        {pendingCount > 0 && (
          <span className="fams-kiosk-badge is-pending">
            {pendingCount} waiting to sync
          </span>
        )}
      </div>
    </header>
  );

  if (status === 'pairing') {
    return (
      <div className="fams-kiosk-pair">
        <div className="fams-kiosk-pair-card">
          <div className="fams-kiosk-pair-icon">
            <ShieldCheck className="h-8 w-8 text-[var(--accent)]" strokeWidth={1.75} />
          </div>
          <p className="fams-kiosk-pair-eyebrow">FAMS</p>
          <h1 className="fams-kiosk-pair-title">Floor kiosk</h1>
          <p className="fams-kiosk-pair-copy">
            Install this page to the home screen for a full-screen scanner. On factory
            Wi‑Fi it unlocks automatically; off-site, an admin unlocks once with Google.
          </p>

          {googleConfigError && (
            <div className="fams-alert fams-alert-warning mb-4 text-left" role="status">
              {googleConfigError}
            </div>
          )}
          {pairError && (
            <div className="fams-alert fams-alert-danger mb-4 text-left" role="alert">
              {pairError}
            </div>
          )}

          <div
            ref={googleBtnRef}
            className="fams-kiosk-google-host"
            aria-busy={googleLoading}
            aria-label="Sign in with Google to unlock kiosk"
          />
          {googleLoading && <p className="fams-kiosk-pair-status">Unlocking device…</p>}
          <p className="fams-kiosk-pair-hint">
            After unlock, this tablet stays paired until an admin regenerates the kiosk token.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'empty_roster') {
    return (
      <div className="fams-kiosk-screen fams-kiosk-screen--warn">
        {chrome}
        <Users className="w-20 h-20 text-[var(--warning)] mb-6" strokeWidth={1.5} />
        <h1 className="fams-kiosk-name">No faces enrolled</h1>
        <p className="fams-kiosk-message max-w-lg">{message}</p>
        <button type="button" onClick={() => void startScanner()} className="fams-btn fams-btn-primary mt-8 h-12 px-8 text-base">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (status === 'error') {
    const hasDeviceToken = ensureKioskToken();
    return (
      <div className="fams-kiosk-screen fams-kiosk-screen--danger">
        {chrome}
        <XCircle className="w-20 h-20 text-[var(--danger)] mb-6" strokeWidth={1.5} />
        <h1 className="fams-kiosk-name text-[var(--danger)]">Try again</h1>
        <p className="fams-kiosk-message max-w-lg">{message}</p>
        <button
          type="button"
          onClick={() => {
            if (hasDeviceToken) {
              void startScanner();
            } else {
              setStatus('pairing');
              setMessage('An administrator must unlock this device');
            }
          }}
          className="fams-btn fams-btn-primary mt-8 h-12 px-8 text-base"
        >
          <RefreshCw className="w-4 h-4" /> {hasDeviceToken ? 'Retry scanner' : 'Unlock with Google'}
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="fams-kiosk-screen">
        {chrome}
        <span className="w-10 h-10 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mb-6" />
        <p className="fams-kiosk-message">{message}</p>
      </div>
    );
  }

  // Live stage keeps <video> mounted across scanning / feedback / idle overlays
  const feedback =
    status === 'success' || status === 'offline' || status === 'duplicate' || status === 'multiface'
      ? status
      : null;

  return (
    <div className="fams-kiosk-live">
      {chrome}
      <div className="fams-kiosk-stage">
        <video ref={videoRef} autoPlay muted playsInline className="fams-kiosk-video" />
        <div className="fams-kiosk-stage-footer">
          <span className="fams-kiosk-stage-label">
            {status === 'processing' ? 'Processing…' : status === 'idle' ? 'Idle' : message || 'Face the camera'}
          </span>
          {status === 'processing' && (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
        </div>

        {status === 'idle' && (
          <div
            className="fams-kiosk-idle-overlay"
            onClick={resumeFromIdle}
            onKeyDown={(e) => e.key === 'Enter' && resumeFromIdle()}
            role="button"
            tabIndex={0}
          >
            <p className="fams-kiosk-idle-title">Idle</p>
            <p className="fams-kiosk-idle-copy">Tap anywhere to resume scanning</p>
          </div>
        )}

        {feedback && (
          <div className={`fams-kiosk-feedback fams-kiosk-feedback--${feedback === 'success' ? 'ok' : 'warn'}`}>
            {feedback === 'offline' ? (
              <WifiOff className="w-20 h-20 mb-6" strokeWidth={1.5} />
            ) : feedback === 'duplicate' || feedback === 'multiface' ? (
              <AlertTriangle className="w-20 h-20 mb-6" strokeWidth={1.5} />
            ) : (
              <CheckCircle className="w-20 h-20 mb-6" strokeWidth={1.5} />
            )}
            {workerName && feedback !== 'multiface' && <h1 className="fams-kiosk-name">{workerName}</h1>}
            <p className="fams-kiosk-message">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
