import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { CheckCircle, XCircle, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { getFaceDescriptors, logAttendance, getSettings } from '../../api/client';
import { bootstrapKioskToken, ensureKioskToken } from '../utils/kioskToken';

const cameraConstraints: Record<string, MediaTrackConstraints> = {
  '480p': { width: { ideal: 640 }, height: { ideal: 480 } },
  '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
  '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
};

export function KioskMode() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState<faceapi.FaceMatcher | null>(null);
  const [status, setStatus] = useState<'loading' | 'scanning' | 'processing' | 'success' | 'offline' | 'duplicate' | 'error'>('loading');
  const [message, setMessage] = useState('Loading…');
  const [workerName, setWorkerName] = useState('');
  const [scanIntervalMs, setScanIntervalMs] = useState(800);
  const [idleTimeoutSec, setIdleTimeoutSec] = useState(30);
  const [cameraRes, setCameraRes] = useState('720p');
  const [online, setOnline] = useState(navigator.onLine);

  const lastScanRef = useRef<{ employeeCode: string; time: number } | null>(null);
  const statusRef = useRef(status);
  const resetTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => { statusRef.current = status; }, [status]);

  const scheduleReset = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    resetTimersRef.current.push(id);
  };

  useEffect(() => () => {
    resetTimersRef.current.forEach(clearTimeout);
    resetTimersRef.current = [];
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        const paired = (await bootstrapKioskToken()) || ensureKioskToken();
        if (!paired) {
          throw new Error(
            'This kiosk is not paired. Open Settings → Security as admin and regenerate the kiosk token, or reload on the factory LAN.',
          );
        }

        // All three nets are required before .withFaceLandmarks().withFaceDescriptor()
        // (same pipeline as FaceRegistrationModal).
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);

        const [descriptors, settings] = await Promise.all([
          getFaceDescriptors(),
          getSettings().catch(() => ({ ai_threshold: '0.6', sec_kiosk_token: undefined as string | undefined })),
        ]);

        ensureKioskToken(settings.sec_kiosk_token);
        setScanIntervalMs(Number(settings.ai_scan_interval || 800));
        setIdleTimeoutSec(Number(settings.kiosk_idle_timeout || 30));
        setCameraRes(settings.kiosk_camera_res || '720p');

        if (descriptors.length > 0) {
          const labeledDescriptors = descriptors.map(d =>
            new faceapi.LabeledFaceDescriptors(d.employeeCode, [new Float32Array(d.descriptor)])
          );
          const threshold = parseFloat(settings.ai_threshold || '0.6');
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, threshold));
        }

        // Only mark ready after nets + matcher setup finish so the scan loop never races.
        setModelsLoaded(true);
        setStatus('scanning');
        setMessage('Face the camera');
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Could not start scanner. Check network and model files.');
      }
    };
    initialize();
  }, []);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let idleTimer: ReturnType<typeof setInterval> | null = null;
    let lastActivity = Date.now();

    const startScanning = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(async () => {
        if (statusRef.current !== 'scanning' || !videoRef.current || !faceMatcher) return;

        try {
          // face-api: withFaceDescriptor exists only after withFaceLandmarks().
          // Calling it on DetectSingleFaceTask is a runtime TypeError (and a TS error).
          const detection = await faceapi
            .detectSingleFace(videoRef.current)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            lastActivity = Date.now();
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

            if (bestMatch.label !== 'unknown') {
              const now = Date.now();
              if (lastScanRef.current?.employeeCode === bestMatch.label && (now - lastScanRef.current.time) < 10000) {
                return;
              }

              setStatus('processing');
              lastScanRef.current = { employeeCode: bestMatch.label, time: now };

              const response = await logAttendance({
                employeeCode: bestMatch.label,
                eventType: 'auto',
                method: 'face',
                confidence: Math.round((1 - bestMatch.distance) * 100),
                clientEventId: globalThis.crypto?.randomUUID?.(),
                occurredAt: new Date().toISOString(),
              });

              const event = response.result ?? response;
              const isQueued = response.online === false || response.queued === true;
              setWorkerName(event.worker?.name || bestMatch.label);
              const isDuplicate = event.syncStatus === 'duplicate';
              setStatus(isDuplicate ? 'duplicate' : isQueued ? 'offline' : 'success');
              setMessage(isDuplicate ? 'This scan was already recorded' : isQueued ? 'Saved on this device and waiting to sync' : (event.eventType === 'checked-in' ? 'Checked in' : 'Checked out'));

              scheduleReset(() => {
                setStatus('scanning');
                setMessage('Face the camera');
              }, 4000);
            }
          }
        } catch (err: any) {
          console.error(err);
          setStatus('error');
          setMessage(err.message || 'Scan failed');
          scheduleReset(() => {
            setStatus('scanning');
            setMessage('Face the camera');
          }, 4000);
        }
      }, scanIntervalMs);
    };

    const stopScanning = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (modelsLoaded && videoRef.current) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setMessage('Camera requires HTTPS or browser permission.');
        return;
      }
      const constraints = cameraConstraints[cameraRes] || cameraConstraints['720p'];
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', ...constraints },
      })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
          startScanning();
          idleTimer = setInterval(() => {
            if (Date.now() - lastActivity > idleTimeoutSec * 1000) {
              setMessage('Idle — tap screen to resume');
            }
          }, 5000);
        })
        .catch(err => {
          console.error(err);
          setStatus('error');
          setMessage('Camera access denied.');
        });
    }

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (idleTimer) clearInterval(idleTimer);
      stopScanning();
    };
  }, [modelsLoaded, faceMatcher, scanIntervalMs, idleTimeoutSec, cameraRes]);

  if (status === 'success' || status === 'offline' || status === 'duplicate') {
    return (
      <div className={`fams-kiosk-screen bg-[var(--surface)] border-t-8 ${status === 'success' ? 'border-[var(--success)]' : 'border-[var(--warning)]'}`}>
        {status === 'offline' ? <WifiOff className="w-20 h-20 text-[var(--warning)] mb-6" strokeWidth={1.5} /> : status === 'duplicate' ? <AlertTriangle className="w-20 h-20 text-[var(--warning)] mb-6" strokeWidth={1.5} /> : <CheckCircle className="w-20 h-20 text-[var(--success)] mb-6" strokeWidth={1.5} />}
        <h1 className="fams-kiosk-name">{workerName}</h1>
        <p className="fams-kiosk-message">{message}</p>
        <p className="text-sm text-[var(--muted)] mt-3">{online ? 'Connection available' : 'Offline mode'}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fams-kiosk-screen bg-[var(--surface)] border-t-8 border-[var(--danger)]">
        <XCircle className="w-20 h-20 text-[var(--danger)] mb-6" strokeWidth={1.5} />
        <h1 className="fams-kiosk-name text-[var(--danger)]">Try again</h1>
        <p className="fams-kiosk-message max-w-lg">{message}</p>
        <button
          type="button"
          onClick={() => { setStatus('scanning'); setMessage('Face the camera'); }}
          className="fams-btn fams-btn-primary mt-8 h-12 px-8 text-base"
        >
          <RefreshCw className="w-4 h-4" /> Continue scanning
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[var(--canvas)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <h1 className="text-xl font-semibold text-[var(--text)]">Attendance kiosk</h1>
        <p className="text-lg text-[var(--muted)] mt-1">{message}</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl border-2 border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video object-cover scale-x-[-1] bg-[var(--gray-100)]"
          />
          <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-base font-medium text-[var(--text)]">
              {status === 'processing' ? 'Processing…' : status === 'loading' ? 'Starting scanner…' : 'Ready to scan'}
            </span>
            {status === 'processing' && (
              <span className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
