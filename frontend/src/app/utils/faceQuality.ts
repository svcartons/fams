import type * as faceapi from 'face-api.js';

export type FaceQualityIssue =
  | 'no_face'
  | 'too_small'
  | 'low_score'
  | 'not_frontal'
  | 'unstable';

export type FaceQualityResult = {
  ok: boolean;
  issue?: FaceQualityIssue;
  message: string;
  score: number;
  faceRatio: number;
};

type DetectionWithLandmarks = faceapi.WithFaceLandmarks<
  { detection: faceapi.FaceDetection },
  faceapi.FaceLandmarks68
>;

const ISSUE_MSG: Record<FaceQualityIssue, string> = {
  no_face: 'No face detected. Face the camera with good lighting.',
  too_small: 'Move closer to the camera.',
  low_score: 'Hold still — face not clear enough.',
  not_frontal: 'Look straight at the camera.',
  unstable: 'Hold still for a moment.',
};

/** Assess face size, detection score, and approximate frontal pose. */
export function assessFaceQuality(
  detection: DetectionWithLandmarks | undefined | null,
  videoWidth: number,
  videoHeight: number,
  opts?: { minFaceRatio?: number; minScore?: number; maxYawProxy?: number },
): FaceQualityResult {
  const minFaceRatio = opts?.minFaceRatio ?? 0.18;
  const minScore = opts?.minScore ?? 0.55;
  const maxYawProxy = opts?.maxYawProxy ?? 0.28;

  if (!detection) {
    return { ok: false, issue: 'no_face', message: ISSUE_MSG.no_face, score: 0, faceRatio: 0 };
  }

  const box = detection.detection.box;
  const score = detection.detection.score;
  const faceRatio = Math.min(box.width / Math.max(videoWidth, 1), box.height / Math.max(videoHeight, 1));

  if (score < minScore) {
    return { ok: false, issue: 'low_score', message: ISSUE_MSG.low_score, score, faceRatio };
  }
  if (faceRatio < minFaceRatio) {
    return { ok: false, issue: 'too_small', message: ISSUE_MSG.too_small, score, faceRatio };
  }

  // Landmark yaw proxy: nose should sit near eye midpoint horizontally
  try {
    const positions = detection.landmarks.positions;
    const leftEye = positions[36];
    const rightEye = positions[45];
    const nose = positions[30];
    const midX = (leftEye.x + rightEye.x) / 2;
    const eyeDist = Math.max(Math.abs(rightEye.x - leftEye.x), 1);
    const yawProxy = Math.abs(nose.x - midX) / eyeDist;
    if (yawProxy > maxYawProxy) {
      return { ok: false, issue: 'not_frontal', message: ISSUE_MSG.not_frontal, score, faceRatio };
    }
  } catch {
    /* landmarks missing — skip pose check */
  }

  return { ok: true, message: 'Good', score, faceRatio };
}

export const ENROLL_POSE_PROMPTS = [
  'Look straight at the camera',
  'Turn your head slightly left',
  'Turn your head slightly right',
  'Tilt your chin slightly up',
  'Look straight again and hold still',
];
