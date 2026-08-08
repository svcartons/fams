import bcrypt from 'bcryptjs';
import prisma from '../db';

/**
 * One-time / emergency admin password set from Render env.
 * Set ADMIN_RESET_USERNAME + ADMIN_RESET_PASSWORD, redeploy, log in,
 * then REMOVE both env vars and redeploy again.
 */
export async function applyAdminPasswordResetFromEnv(): Promise<void> {
  const username = (process.env.ADMIN_RESET_USERNAME || '').trim();
  const password = process.env.ADMIN_RESET_PASSWORD || '';

  if (!username && !password) return;

  if (!username || !password) {
    console.error(
      '[AdminReset] Set BOTH ADMIN_RESET_USERNAME and ADMIN_RESET_PASSWORD, or neither. Skipped.'
    );
    return;
  }

  if (password.length < 12) {
    console.error('[AdminReset] ADMIN_RESET_PASSWORD must be at least 12 characters. Skipped.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        authProvider: 'local',
        mfaEnabled: false,
        mfaSecret: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor: 'System',
        action: 'Admin Password Reset (env)',
        target: existing.username,
        details: 'Password set via ADMIN_RESET_* environment variables',
        ipAddress: 'System',
      },
    }).catch(() => {});
    console.log(
      `[AdminReset] Password updated for user "${existing.username}". Remove ADMIN_RESET_* from Render env after you log in.`
    );
    return;
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash,
      name: username,
      role: 'admin',
      authProvider: 'local',
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: 'System',
      action: 'Admin Created (env reset)',
      target: username,
      details: 'Admin created via ADMIN_RESET_* environment variables',
      ipAddress: 'System',
    },
  }).catch(() => {});
  console.log(
    `[AdminReset] Created admin "${username}". Remove ADMIN_RESET_* from Render env after you log in.`
  );
}
