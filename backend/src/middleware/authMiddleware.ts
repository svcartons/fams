import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db';
import { getIp, isPrivateIp } from '../utils/helpers';
import crypto from 'crypto';

const configuredSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
}
const JWT_SECRET = configuredSecret || 'fams-development-only-secret-change-me';
const SESSION_COOKIE = 'fams_session';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  terminalId?: string;
  authType?: 'user' | 'terminal';
}

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim() || null;
  return null;
}

function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function getRequestToken(req: Request): string | null {
  return getBearerToken(req) || getCookie(req, SESSION_COOKIE);
}

export function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 8}`,
  ];
  if (secure) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

export function hashTerminalToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = getRequestToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // 1. Mobile terminal tokens (paired devices)
  if (token.startsWith('fams-terminal-')) {
    try {
      const terminal = await prisma.mobileTerminal.findFirst({
        where: {
          status: 'active',
          OR: [{ tokenHash: hashTerminalToken(token) }, { token }],
        },
      });
      if (terminal) {
        // @ts-ignore
        req.user = {
          id: terminal.id,
          username: terminal.name,
          role: 'terminal',
          terminalId: terminal.id,
          authType: 'terminal',
        } as AuthUser;
        return next();
      }
    } catch (dbErr) {
      console.error('[Terminal Auth Error]', dbErr);
    }
  }

  // 2. Browser kiosk credential (`fams-kiosk-*` from Settings → regenerate)
  // Must run outside the terminal-prefix branch — legacy tokens never start with fams-terminal-.
  try {
    const kioskSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_kiosk_token' } });
    if (kioskSetting?.value && token === kioskSetting.value) {
      // @ts-ignore
      req.user = { id: 'kiosk', username: 'Kiosk Terminal', role: 'terminal', authType: 'terminal' } as AuthUser;
      return next();
    }
  } catch (dbErr) {
    console.error('[Kiosk Auth Error]', dbErr);
  }

  // 3. Otherwise verify as supervisor/admin JWT
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    // @ts-ignore
    req.user = { ...(user as AuthUser), authType: 'user' } as AuthUser;
    next();
  });
};

export const authorizeRoles = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  // @ts-ignore
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

export const requireUser = authorizeRoles('admin', 'hr', 'supervisor');
export const requireTerminal = authorizeRoles('terminal');

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // @ts-ignore
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

function ipInCidr(ip: string, cidr: string): boolean {
  try {
    let cleanIp = ip;
    if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') {
      cleanIp = '127.0.0.1';
    }
    const cleanCidr = cidr.trim();
    if (!cleanCidr) return false;

    if (!cleanCidr.includes('/')) {
      return cleanIp === cleanCidr || (cleanIp === '127.0.0.1' && cleanCidr === 'localhost');
    }

    const [range, bitsStr] = cleanCidr.split('/');
    const bits = parseInt(bitsStr, 10);

    const ipParts = cleanIp.split('.').map(Number);
    const rangeParts = range.split('.').map(Number);

    if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

    const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const rangeNum = (rangeParts[0] << 24) + (rangeParts[1] << 16) + (rangeParts[2] << 8) + rangeParts[3];

    const mask = bits === 0 ? 0 : (~0 << (32 - bits));

    return (ipNum & mask) === (rangeNum & mask);
  } catch (e) {
    return false;
  }
}

export const ipWhitelistMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Factory floor devices (mobile kiosks, terminals) always use /api/* — never block API on LAN
  if (req.path === '/' || req.path.startsWith('/api/') || req.path.startsWith('/models')) {
    return next();
  }

  try {
    const activeSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_ip_whitelist' } });
    if (activeSetting?.value === 'true') {
      const clientIp = getIp(req);

      if (isPrivateIp(clientIp)) {
        return next();
      }

      const ipListSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_ip_list' } });
      const allowedRanges = (ipListSetting?.value ?? '192.168.1.0/24')
        .split('\n')
        .map(r => r.trim())
        .filter(Boolean);

      let isAllowed = false;
      for (const range of allowedRanges) {
        if (ipInCidr(clientIp, range)) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed) {
        console.warn(`[IP Whitelist Blocked] Access denied for IP: ${clientIp}`);
        return res.status(403).json({ error: `Access denied from IP address ${clientIp}. Contact Admin.` });
      }
    }
  } catch (err) {
    console.error('[IP Whitelist Error]', err);
  }
  next();
};

export const httpsEnforcementMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const forceHttpsSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_force_https' } });
    
    if (forceHttpsSetting?.value === 'true') {
      // Allow local loopbacks and local LAN IPs (192.168.x.x, 172.x.x.x, 10.x.x.x) without redirection
      const isLocal = req.hostname === 'localhost' || 
                      req.hostname === '127.0.0.1' || 
                      /^192\.168\./.test(req.hostname) || 
                      /^172\./.test(req.hostname) || 
                      /^10\./.test(req.hostname);
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

      if (!isHttps && !isLocal) {
        console.warn(`[HTTPS Enforced] Redirecting plaintext request to HTTPS: ${req.hostname}${req.url}`);
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
    }
  } catch (err) {
    console.error('[HTTPS Enforcement Error]', err);
  }
  next();
};
