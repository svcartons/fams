import { Router, Request, Response } from 'express';
import prisma from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { authenticateToken, clearSessionCookie, setSessionCookie } from '../middleware/authMiddleware';
import { getIp } from '../utils/helpers';
import { sendWebhookNotification } from '../utils/notifications';
import { generateTotpSecret, verifyTotp } from '../utils/totp';
import { ensureKioskTokenSetting } from '../utils/ensureKioskToken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fams-development-only-secret-change-me';
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const ADMIN_GOOGLE_EMAIL = (process.env.ADMIN_GOOGLE_EMAIL || 'cvjayanth005@gmail.com').trim().toLowerCase();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

type AuthUserPayload = {
  id: string;
  username: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  hasSeenOnboarding: boolean;
  passwordHash?: string | null;
  authProvider?: string | null;
};

async function issueAuthResponse(res: Response, user: AuthUserPayload) {
  const jwtExpirySetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_jwt_expiry' } });
  const jwtExpiryMins = jwtExpirySetting ? Number(jwtExpirySetting.value) : 480;

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, type: 'user' },
    JWT_SECRET,
    { expiresIn: `${jwtExpiryMins}m` }
  );

  setSessionCookie(res, token);

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      hasSeenOnboarding: user.hasSeenOnboarding,
      hasPassword: !!user.passwordHash,
      authProvider: user.authProvider || 'local',
    },
  });
}

// Brute-force protection: simple in-memory store for dev
const loginAttempts = new Map<string, { count: number, lockUntil: number }>();

// Prune loginAttempts map every hour to prevent memory leaks
const intervalKey = 'loginAttemptsInterval';
if ((global as any)[intervalKey]) {
  clearInterval((global as any)[intervalKey]);
}
(global as any)[intervalKey] = setInterval(() => {
  const now = Date.now();
  for (const [ip, attempt] of loginAttempts.entries()) {
    if (attempt.lockUntil < now && attempt.count > 0) {
      loginAttempts.delete(ip);
    }
  }
}, 60 * 60 * 1000);

// Helper for basic URL sanitization
const isValidUrl = (url?: string) => {
  if (!url || url.trim() === '') return true;
  // Basic check for http/https prefix
  return /^https?:\/\/.+/i.test(url.trim());
};

const validatePasswordLength = async (password: string): Promise<{ isValid: boolean, minLen: number }> => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'sec_password_min_len' } });
    const minLen = setting ? Number(setting.value) : 12;
    return { isValid: password.length >= minLen, minLen };
  } catch (e) {
    return { isValid: password.length >= 12, minLen: 12 };
  }
};

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const ip = getIp(req);
  const now = Date.now();

  // Check rate limit
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.lockUntil > now) {
    try {
      const durationSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_lockout_duration' } });
      const durationMins = durationSetting ? Number(durationSetting.value) : 15;
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${durationMins} minutes.` });
    } catch (e) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
  }

  try {
    const { username, password, otp } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    
    // Check if user exists and password is valid (Google-only accounts have no password)
    let isValid = false;
    if (user?.passwordHash) {
      isValid = await bcrypt.compare(password, user.passwordHash);
    }

    if (!isValid) {
      // Record failed attempt using DB settings
      let maxAttempts = 5;
      let durationMins = 15;
      try {
        const lockoutSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_lockout_attempts' } });
        if (lockoutSetting) maxAttempts = Number(lockoutSetting.value);

        const durationSetting = await prisma.systemSetting.findUnique({ where: { key: 'sec_lockout_duration' } });
        if (durationSetting) durationMins = Number(durationSetting.value);
      } catch (dbErr) {
        // Fallback to defaults
      }

      const count = (attempt?.count || 0) + 1;
      const lockUntil = count >= maxAttempts ? now + durationMins * 60 * 1000 : 0;
      loginAttempts.set(ip, { count, lockUntil });

      // Dispatch failed login alert
      sendWebhookNotification(
        'notif_login_failed',
        `⚠️ *Failed Login Attempt*\n• Username: \`${username}\`\n• IP Address: \`${ip}\`\n• Attempts: \`${count}/${maxAttempts}\`${count >= maxAttempts ? ' *(IP LOCKED)*' : ''}`
      ).catch(() => {});

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user!.mfaEnabled) {
      if (!otp) return res.status(401).json({ error: 'MFA_REQUIRED: Enter your authenticator code', code: 'MFA_REQUIRED' });
      if (!user!.mfaSecret || !verifyTotp(user!.mfaSecret, String(otp))) {
        return res.status(401).json({ error: 'Invalid authenticator code', code: 'MFA_INVALID' });
      }
    }

    // Success: Reset rate limit
    loginAttempts.delete(ip);

    return issueAuthResponse(res, user!);
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/google-client-id — public; frontend loads GIS without rebuild
router.get('/google-client-id', (_req: Request, res: Response) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null });
});

// POST /api/auth/google — Google Identity Services ID token login
router.post('/google', async (req: Request, res: Response) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        error: 'Google Sign-In not configured. Add GOOGLE_CLIENT_ID to backend/.env',
      });
    }

    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google credential required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    if (payload.email_verified !== true) {
      return res.status(403).json({ error: 'Google email is not verified' });
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const displayName = payload.name || email.split('@')[0];
    const picture = payload.picture || null;
    const isAdminEmail = email === ADMIN_GOOGLE_EMAIL;

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
      },
    });

    if (isAdminEmail) {
      // Prefer linking an existing admin (e.g. "Jayanth") so the account is not duplicated
      if (!user) {
        const unlinkableAdmin = await prisma.user.findFirst({
          where: { role: 'admin', googleId: null },
          orderBy: { createdAt: 'asc' },
        });
        if (unlinkableAdmin) {
          user = unlinkableAdmin;
        }
      }

      if (user) {
        // Link Google without wiping an existing local password — admins may use either.
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email,
            googleId,
            name: displayName || user.name,
            role: 'admin',
            authProvider: user.passwordHash ? 'local' : 'google',
            avatarUrl: picture || user.avatarUrl,
          },
        });
      } else {
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'admin';
        let username = baseUsername;
        let n = 0;
        while (await prisma.user.findUnique({ where: { username } })) {
          n += 1;
          username = `${baseUsername}${n}`;
        }
        user = await prisma.user.create({
          data: {
            username,
            email,
            googleId,
            name: displayName,
            role: 'admin',
            authProvider: 'google',
            avatarUrl: picture,
            passwordHash: null,
          },
        });
      }
    } else if (user) {
      // Existing local user linking Google for the same email
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          authProvider: user.authProvider === 'local' ? 'local' : 'google',
          avatarUrl: picture || user.avatarUrl,
          name: displayName || user.name,
        },
      });
    } else {
      return res.status(403).json({ error: 'This Google account is not authorized for FAMS' });
    }

    return issueAuthResponse(res, user);
  } catch (err: any) {
    console.error('[Google Auth]', err?.message || err);
    return res.status(401).json({ error: 'Google Sign-In failed' });
  }
});

// POST /api/auth/kiosk-google — unlock a phone/PWA kiosk with an authorized Google admin.
// Returns the shared device token only (no admin browser session).
router.post('/kiosk-google', async (req: Request, res: Response) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        error: 'Google Sign-In not configured. Add GOOGLE_CLIENT_ID to the backend environment.',
      });
    }

    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google credential required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    if (payload.email_verified !== true) {
      return res.status(403).json({ error: 'Google email is not verified' });
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const isAdminEmail = email === ADMIN_GOOGLE_EMAIL;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
      },
      select: { id: true, username: true, role: true, email: true },
    });

    const authorized = isAdminEmail || user?.role === 'admin';
    if (!authorized) {
      await prisma.auditLog.create({
        data: {
          actor: email,
          action: 'Kiosk Unlock Denied',
          target: 'Kiosk',
          details: 'Unauthorized Google account attempted to unlock kiosk',
          ipAddress: getIp(req),
        },
      }).catch(() => {});
      return res.status(403).json({
        error: 'This Google account is not authorized to unlock the kiosk',
      });
    }

    const token = await ensureKioskTokenSetting();

    await prisma.auditLog.create({
      data: {
        actor: user?.username || email,
        action: 'Kiosk Unlocked via Google',
        target: 'Kiosk',
        details: `Device unlocked by ${email}`,
        ipAddress: getIp(req),
      },
    }).catch(() => {});

    return res.json({ token });
  } catch (err: any) {
    console.error('[Kiosk Google]', err?.message || err);
    return res.status(401).json({ error: 'Google Sign-In failed' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ message: 'Signed out' });
});

router.get('/session', authenticateToken, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (authUser?.authType === 'terminal') {
    return res.status(403).json({ error: 'Interactive user session required' });
  }
  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      avatarUrl: true,
      hasSeenOnboarding: true,
      passwordHash: true,
      authProvider: true,
    },
  });
  if (!user) return res.status(401).json({ error: 'Session user not found' });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      hasSeenOnboarding: user.hasSeenOnboarding,
      hasPassword: !!user.passwordHash,
      authProvider: user.authProvider || 'local',
    },
  });
});

router.post('/mfa/setup', authenticateToken, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (!['admin', 'hr'].includes(authUser?.role)) return res.status(403).json({ error: 'MFA setup requires a privileged user' });
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: authUser.id }, data: { mfaSecret: secret, mfaEnabled: false } });
  const issuer = encodeURIComponent('FAMS');
  const account = encodeURIComponent(authUser.username);
  res.json({ secret, otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}` });
});

router.post('/mfa/enable', authenticateToken, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  const user = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!user?.mfaSecret || !verifyTotp(user.mfaSecret, String(req.body.otp || ''))) {
    return res.status(400).json({ error: 'Invalid authenticator code' });
  }
  await prisma.user.update({ where: { id: authUser.id }, data: { mfaEnabled: true } });
  res.json({ message: 'MFA enabled' });
});

router.post('/mfa/disable', authenticateToken, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (authUser?.role !== 'admin') return res.status(403).json({ error: 'Only administrators can disable MFA' });
  await prisma.user.update({ where: { id: authUser.id }, data: { mfaEnabled: false, mfaSecret: null } });
  res.json({ message: 'MFA disabled' });
});

// POST /api/auth/change-password - Self-service password change / set
// Google-only accounts (passwordHash null) may SET a password without currentPassword.
router.post('/change-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const authUser = (req as any).user;
    if (authUser?.authType === 'terminal') {
      return res.status(403).json({ error: 'Interactive user session required' });
    }
    const userId = authUser?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Access token required' });
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password required' });
    }

    const { isValid, minLen } = await validatePasswordLength(newPassword);
    if (!isValid) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters long` });
    }

    const user = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isSettingInitialPassword = !user.passwordHash;
    if (!isSettingInitialPassword) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({ error: 'Current password required' });
      }
      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash!);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password incorrect' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        // Once a local password exists, prefer authProvider local (Google stays linked via googleId)
        ...(isSettingInitialPassword ? { authProvider: 'local' } : {}),
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        actor: user.username,
        action: isSettingInitialPassword ? 'Password Set' : 'Password Changed',
        target: 'Self',
        details: isSettingInitialPassword
          ? 'User set a local password (Google account)'
          : 'User updated their own password',
        ipAddress: getIp(req),
      },
    });

    res.json({
      message: isSettingInitialPassword
        ? 'Password set successfully. You can now sign in with username and password.'
        : 'Password updated successfully',
      hasPassword: true,
    });
  } catch (err) {
    console.error('[change-password]', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/onboarding-complete
router.post('/onboarding-complete', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await prisma.user.update({
      where: { id: userId },
      data: { hasSeenOnboarding: true },
    });
    res.json({ message: 'Onboarding marked as completed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// POST /api/auth/setup - Creates an initial admin if no users exist
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      return res.status(403).json({ error: 'Setup already completed' });
    }

    const { username, password, name, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { isValid, minLen } = await validatePasswordLength(password);
    if (!isValid) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters long` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        email,
        name: name || 'System Admin',
        role: 'admin',
      },
    });

    res.json({ message: 'Admin user created successfully', user: { username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Setup failed' });
  }
});

// GET /api/auth/users - List all users (Admin Only)
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, name: true, role: true, avatarUrl: true, createdAt: true }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/auth/users - Create new user (Admin Only)
router.post('/users', authenticateToken, async (req: Request, res: Response) => {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const { username, password, name, role, avatarUrl, email, workerId } = req.body;
    if (!username || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { isValid, minLen } = await validatePasswordLength(password);
    if (!isValid) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters long` });
    }

    if (!isValidUrl(avatarUrl)) {
      return res.status(400).json({ error: 'Invalid avatar URL. Must start with http:// or https://' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await prisma.user.create({
      data: { username, passwordHash, name, role, avatarUrl, email, workerId: workerId || null },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'User Created',
        target: `${user.username} (${user.role})`,
        details: `Account created for ${user.name}`,
        ipAddress: getIp(req),
      },
    });

    res.status(201).json({ 
      message: 'User created successfully', 
      user: { username: user.username, role: user.role } 
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/auth/users/:id - Update user (Admin Only)
router.put('/users/:id', authenticateToken, async (req: Request, res: Response) => {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const { name, role, avatarUrl, password } = req.body;
    
    if (password && password.trim() !== '') {
      const { isValid, minLen } = await validatePasswordLength(password);
      if (!isValid) {
        return res.status(400).json({ error: `Password must be at least ${minLen} characters long` });
      }
    }

    if (!isValidUrl(avatarUrl)) {
      return res.status(400).json({ error: 'Invalid avatar URL. Must start with http:// or https://' });
    }
    
    let updateData: any = { name, role, avatarUrl };
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(password, salt);
    }

    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: updateData,
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'User Updated',
        target: user.username,
        details: `Profile updated for ${user.name} (${user.role})`,
        ipAddress: getIp(req),
      },
    });

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/auth/users/:id - Delete user (Admin Only)
router.delete('/users/:id', authenticateToken, async (req: Request, res: Response) => {
  if ((req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Prevent deleting self
  if ((req as any).user?.id === req.params.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.user.delete({ where: { id: String(req.params.id) } });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'User Deleted',
        target: user.username,
        details: `Account removed for ${user.name}`,
        ipAddress: getIp(req),
      },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Self-service security-question recovery is intentionally disabled.
router.post('/forgot-password/init', async (req: Request, res: Response) => {
  res.status(410).json({ error: 'Self-service security-question recovery has been disabled. Contact an administrator.' });
});

// POST /api/auth/forgot-password/verify - Verify answer and reset
router.post('/forgot-password/verify', async (req: Request, res: Response) => {
  res.status(410).json({ error: 'Self-service security-question recovery has been disabled. Contact an administrator.' });
});

export default router;
