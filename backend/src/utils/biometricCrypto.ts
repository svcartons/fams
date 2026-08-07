import crypto from 'crypto';

const VERSION = 'enc:v1';

function getKey(): Buffer {
  const configured = process.env.BIOMETRIC_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !process.env.BIOMETRIC_ENCRYPTION_KEY) {
    throw new Error('BIOMETRIC_ENCRYPTION_KEY must be configured in production');
  }
  return crypto.scryptSync(configured || 'fams-development-only-biometric-key', 'fams-biometric', 32);
}

export function encryptBiometric(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptBiometric(value: string): string {
  if (!value.startsWith(`${VERSION}:`)) return value;
  const [, version, ivRaw, tagRaw, encryptedRaw] = value.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted biometric value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function isEncryptedBiometric(value: string | null | undefined): boolean {
  return !!value?.startsWith(`${VERSION}:`);
}
