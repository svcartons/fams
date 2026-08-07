import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, X, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { registerFace } from '../../api/client';

interface FaceRegistrationModalProps {
  employeeCode: string;
  workerName: string;
  onClose: () => void;
}

export function FaceRegistrationModal({ employeeCode, workerName, onClose }: FaceRegistrationModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to load facial recognition models. Please check if the /models folder exists.');
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (modelsLoaded && videoRef.current) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera access requires a secure connection (HTTPS) or specific browser permissions on this network.');
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => {
          console.error(err);
          setErrorMsg('Camera access denied or unavailable.');
        });
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [modelsLoaded]);

  const captureFace = async () => {
    if (!videoRef.current || !modelsLoaded) return;
    setScanning(true);
    setErrorMsg('');

    try {
      const detection = await faceapi.detectSingleFace(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setErrorMsg('No face detected. Please face the camera clearly and ensure good lighting.');
        setScanning(false);
        return;
      }

      let avatarPhoto: string | undefined = undefined;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const box = detection.detection.box;
        const expandFactor = 0.5;
        const size = Math.max(box.width, box.height) * (1 + expandFactor);
        const cropX = Math.max(0, box.x - (size - box.width) / 2);
        const cropY = Math.max(0, box.y - (size - box.height) / 2);
        const cropSize = Math.min(size, canvas.width - cropX, canvas.height - cropY);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = 256;
        cropCanvas.height = 256;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.drawImage(
            canvas,
            cropX, cropY, cropSize, cropSize,
            0, 0, 256, 256
          );
          avatarPhoto = cropCanvas.toDataURL('image/jpeg', 0.8);
        }
      }

      const descriptorArray = Array.from(detection.descriptor);
      await registerFace(employeeCode, descriptorArray, avatarPhoto);
      setSuccess(true);
      toast.success('Face registered successfully!');
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to capture face data.');
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900">Register Face: {workerName}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center">
          {errorMsg && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{errorMsg}</span>
            </div>
          )}

          {success ? (
            <div className="flex flex-col items-center py-10 text-green-600">
              <CheckCircle className="w-16 h-16 mb-4" />
              <h3 className="text-2xl font-bold">Registration Complete</h3>
              <p className="text-gray-600 mt-2">Data saved securely.</p>
            </div>
          ) : (
            <>
              <div className="relative w-full max-w-sm aspect-video bg-black rounded-xl overflow-hidden mb-6 border-4 border-gray-100 shadow-inner">
                {!modelsLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center text-white font-medium bg-black/60 z-10">
                    Loading AI models...
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute inset-0 pointer-events-none border-2 border-white/30 m-8 rounded-[30%] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
              </div>

              <button
                onClick={captureFace}
                disabled={!modelsLoaded || scanning}
                className="flex items-center justify-center gap-2 w-full py-4 bg-black text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                <Camera className="w-6 h-6" />
                {scanning ? 'Analyzing Face...' : 'Capture & Register'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
