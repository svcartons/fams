import crypto from 'crypto';
import prisma from '../db';
import { clearSettingsCache } from './settingsCache';

/** Stable local/dev fallback so browser kiosks can pair without admin UI. */
export const DEV_KIOSK_TOKEN = 'fams-kiosk-secure-device-token';

/**
 * Ensure `sec_kiosk_token` exists in SystemSetting.
 * Creates a rotatable `fams-kiosk-*` credential when missing or blank.
 * In non-production, prefers the known DEV token for out-of-the-box local kiosks.
 */
export async function ensureKioskTokenSetting(): Promise<string> {
  const existing = await prisma.systemSetting.findUnique({ where: { key: 'sec_kiosk_token' } });
  if (existing?.value?.trim()) {
    return existing.value.trim();
  }

  const isProd = process.env.NODE_ENV === 'production';
  const token = isProd
    ? `fams-kiosk-${crypto.randomBytes(16).toString('hex')}`
    : DEV_KIOSK_TOKEN;

  await prisma.systemSetting.upsert({
    where: { key: 'sec_kiosk_token' },
    update: { value: token },
    create: { key: 'sec_kiosk_token', value: token },
  });
  clearSettingsCache();
  console.log(`[Kiosk] Ensured sec_kiosk_token (${isProd ? 'rotated' : 'dev default'})`);
  return token;
}
