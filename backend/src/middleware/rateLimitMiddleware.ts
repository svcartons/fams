import { Request, Response, NextFunction } from 'express';
import { getSettingsMap } from '../utils/settingsCache';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Prune expired buckets occasionally so memory stays bounded. */
function pruneBuckets(now: number) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function hit(
  key: string,
  now: number,
  windowMs: number,
  maxReqs: number
): { limited: boolean; retryAfterSec: number } {
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const limited = bucket.count > maxReqs;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { limited, retryAfterSec };
}

/**
 * Production rate limits tuned for a polling SPA (Today refreshes several endpoints).
 * Previously every /api/* request shared one 100/15min bucket — that locked the app.
 */
export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    const path = (req.path || '').toLowerCase();
    const url = (req.originalUrl || req.url || '').toLowerCase();
    const combined = `${path} ${url}`;

    // Public / health / auth bootstrap — never block these.
    if (
      combined.includes('/auth/config') ||
      combined.includes('/auth/google-client-id') ||
      combined.includes('/api/health') ||
      path === '/' ||
      path === '/health'
    ) {
      return next();
    }

    const settings = await getSettingsMap();
    // Defaults raised for admin UI polling. DB value of 100 was locking the SPA —
    // enforce a floor so production stays usable even with old settings rows.
    const windowMins = Math.max(1, Number(settings.sys_rate_limit_window || 15) || 15);
    const configuredMax = Number(settings.sys_rate_limit_max || 3000) || 3000;
    const maxGlobal = Math.max(configuredMax, 2000);
    if (maxGlobal <= 0) return next();

    const now = Date.now();
    pruneBuckets(now);
    const windowMs = windowMins * 60 * 1000;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Stricter bucket only for credential posts (brute-force protection).
    const isAuthPost =
      req.method === 'POST' &&
      (combined.includes('/auth/login') ||
        combined.includes('/auth/google') ||
        combined.includes('/auth/setup') ||
        combined.includes('/auth/forgot-password'));

    if (isAuthPost) {
      const authMax = 40; // per IP / window
      const auth = hit(`${ip}:auth-write`, now, windowMs, authMax);
      if (auth.limited) {
        res.setHeader('Retry-After', String(auth.retryAfterSec));
        return res.status(429).json({
          error: `Too many sign-in attempts. Try again in ${Math.ceil(auth.retryAfterSec / 60)} minutes.`,
        });
      }
    }

    const global = hit(`${ip}:global`, now, windowMs, maxGlobal);
    if (global.limited) {
      res.setHeader('Retry-After', String(global.retryAfterSec));
      return res.status(429).json({
        error: `Rate limit exceeded. Try again in ${Math.ceil(global.retryAfterSec / 60)} minutes.`,
      });
    }

    next();
  } catch {
    next();
  }
}
