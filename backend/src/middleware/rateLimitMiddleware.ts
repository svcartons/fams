import { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Rate-limit ONLY credential endpoints (brute-force protection).
 * Do not throttle the admin SPA — polling live/dashboard/corrections must stay free.
 */
export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    const url = `${req.path || ''} ${req.originalUrl || req.url || ''}`.toLowerCase();
    const isAuthWrite =
      req.method === 'POST' &&
      (url.includes('/auth/login') ||
        url.includes('/auth/google') ||
        url.includes('/auth/setup') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/kiosk-google'));

    if (!isAuthWrite) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 50;
    const key = `${ip}:auth-write`;

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > maxAttempts) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Too many sign-in attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
      });
    }

    next();
  } catch {
    next();
  }
}
