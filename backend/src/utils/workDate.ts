import prisma from '../db';

const IST_OFFSET_MS = 330 * 60 * 1000;
const SHIFT_CUTOFF_HOUR = 6; // work day rolls at 6:00 AM IST when midnightAlgo is off

let cachedMidnightAlgo: boolean | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

/** Load midnightAlgo setting (true = calendar midnight IST, false = 6 AM IST shift cutoff). */
export async function useMidnightRollover(): Promise<boolean> {
  const now = Date.now();
  if (cachedMidnightAlgo !== null && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedMidnightAlgo;
  }
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'midnightAlgo' } });
    cachedMidnightAlgo = row?.value !== 'false';
  } catch {
    cachedMidnightAlgo = true;
  }
  cacheLoadedAt = now;
  return cachedMidnightAlgo!;
}

export function clearWorkDateCache() {
  cachedMidnightAlgo = null;
  cacheLoadedAt = 0;
}

/**
 * Compute YYYY-MM-DD work date for a timestamp.
 * midnightAlgo=true  → IST calendar date
 * midnightAlgo=false → IST date with 6 AM cutoff (night shifts)
 */
export function computeWorkDate(date: Date, midnightAlgo: boolean): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  if (!midnightAlgo && ist.getUTCHours() < SHIFT_CUTOFF_HOUR) {
    ist.setUTCDate(ist.getUTCDate() - 1);
  }
  return ist.toISOString().split('T')[0];
}

export async function getWorkDateForTimestamp(date: Date = new Date()): Promise<string> {
  const midnight = await useMidnightRollover();
  return computeWorkDate(date, midnight);
}

export async function getTodayWorkDate(): Promise<string> {
  return getWorkDateForTimestamp(new Date());
}

/** UTC range covering all timestamps that belong to a given workDate string. */
export function workDateToUtcRange(workDate: string, midnightAlgo: boolean): { start: Date; end: Date } {
  const [y, m, d] = workDate.split('-').map(Number);
  if (midnightAlgo) {
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS);
    return { start, end };
  }
  const start = new Date(Date.UTC(y, m - 1, d, SHIFT_CUTOFF_HOUR, 0, 0, 0) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m - 1, d + 1, SHIFT_CUTOFF_HOUR, 0, 0, 0) - IST_OFFSET_MS - 1);
  return { start, end };
}

export type AttendanceEventLite = {
  eventType: string;
  workDate: string | null;
  timestamp: Date;
};

/**
 * Resolve auto event type using today's work context.
 * Prior work days do not affect today's first scan.
 */
export function resolveAutoEventType(
  latest: AttendanceEventLite | null | undefined,
  todayWorkDate: string,
): 'checked-in' | 'checked-out' {
  if (!latest) return 'checked-in';

  const latestWorkDate = latest.workDate || computeWorkDate(new Date(latest.timestamp), true);
  if (latestWorkDate < todayWorkDate) {
    return 'checked-in';
  }

  if (['tea-break', 'lunch-break'].includes(latest.eventType)) {
    return 'checked-in';
  }
  if (latest.eventType === 'checked-in') {
    return 'checked-out';
  }
  return 'checked-in';
}

/** Status for live dashboard from today's events only. */
export function statusFromTodayEvents(
  todayEvents: AttendanceEventLite[],
): 'checked-in' | 'tea-break' | 'lunch-break' | 'checked-out' | 'absent' {
  if (!todayEvents.length) return 'absent';
  const latest = todayEvents[todayEvents.length - 1];
  const t = latest.eventType;
  if (['checked-in', 'tea-break', 'lunch-break', 'checked-out'].includes(t)) {
    return t as 'checked-in' | 'tea-break' | 'lunch-break' | 'checked-out';
  }
  return 'absent';
}
