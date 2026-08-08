import { Request, Response, NextFunction } from 'express';
import { getSettingsMap } from '../utils/settingsCache';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Local/dev: skip aggressive limiting so SPA polling + retry storms don't lock out the app.
    // Production keeps settings-driven limits (defaults: 100 / 15 min).
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    // Never rate-limit public auth bootstrap — failed password retries were blocking Google SSO config.
    const path = (req.path || '').toLowerCase();
    const url = (req.originalUrl || '').toLowerCase();
    if (
      path.includes('/auth/config') ||
      path.includes('/auth/google-client-id') ||
      url.includes('/api/auth/config') ||
      url.includes('/api/auth/google-client-id') ||
      path === '/health' ||
      url.includes('/api/health')
    ) {
      return next();
    }

    const settings = await getSettingsMap();
    const windowMins = Number(settings.sys_rate_limit_window || 15);
    const maxReqs = Number(settings.sys_rate_limit_max || 100);
    if (maxReqs <= 0) return next();

    const key = `${req.ip}:${req.path.split('/')[1] || 'root'}`;
    const now = Date.now();
    const windowMs = windowMins * 60 * 1000;
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > maxReqs) {
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${maxReqs} requests per ${windowMins} minutes.`,
      });
    }
    next();
  } catch {
    next();
  }
}
