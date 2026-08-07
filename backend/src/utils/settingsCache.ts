import prisma from '../db';
import { mergeSettings, SETTINGS_DEFAULTS } from './settingsDefaults';

let cached: Record<string, string> | null = null;
let cachedAt = 0;
const TTL_MS = 30_000;

export async function getSettingsMap(force = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!force && cached && now - cachedAt < TTL_MS) {
    return cached;
  }
  const rows = await prisma.systemSetting.findMany();
  const fromDb = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cached = mergeSettings(fromDb);
  cachedAt = now;
  return cached;
}

export function clearSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}

export { SETTINGS_DEFAULTS };
