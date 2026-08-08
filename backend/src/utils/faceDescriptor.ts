import { decryptBiometric, encryptBiometric } from './biometricCrypto';

const DESCRIPTOR_LEN = 128;

function isFloatArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === DESCRIPTOR_LEN && typeof v[0] === 'number';
}

/** Normalize stored biometric blob into one or more 128-d descriptors. */
export function parseFaceDescriptors(raw: string | null | undefined): number[][] {
  if (!raw) return [];
  try {
    const decrypted = decryptBiometric(raw);
    if (decrypted.startsWith('[')) {
      const parsed = JSON.parse(decrypted);
      if (isFloatArray(parsed)) return [parsed];
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (isFloatArray(parsed[0])) {
          return parsed.filter(isFloatArray);
        }
        // Nested wrapper { descriptors: [...] } unlikely; ignore
      }
      return [];
    }
    const buffer = Buffer.from(decrypted, 'base64');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const arr = Array.from(new Float32Array(arrayBuffer));
    return isFloatArray(arr) ? [arr] : [];
  } catch {
    return [];
  }
}

/** Serialize one or more descriptors for encrypted storage (JSON array of vectors). */
export function serializeFaceDescriptors(descriptors: number[][]): string {
  const cleaned = descriptors.filter(isFloatArray);
  if (cleaned.length === 0) throw new Error('No valid face descriptors');
  // Multi or single: always JSON for forward compatibility
  return encryptBiometric(JSON.stringify(cleaned.length === 1 ? cleaned[0] : cleaned));
}

export function normalizeIncomingFacePayload(faceDescriptor: unknown): number[][] {
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length === 0) {
    throw new Error('Missing or invalid faceDescriptor');
  }
  // Multi: [[...], [...]]
  if (Array.isArray(faceDescriptor[0])) {
    const multi = (faceDescriptor as unknown[]).filter(isFloatArray) as number[][];
    if (multi.length === 0) throw new Error('Missing or invalid faceDescriptor');
    return multi;
  }
  // Single: [...]
  if (isFloatArray(faceDescriptor)) return [faceDescriptor];
  throw new Error('Missing or invalid faceDescriptor');
}
