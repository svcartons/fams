import { Router, Request, Response } from 'express';
import { getSettingsMap } from '../utils/settingsCache';
import prisma from '../db';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireAdmin, requireTerminal, getRequestToken, hashTerminalToken } from '../middleware/authMiddleware';
import { getIp } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import { parseFaceDescriptors } from '../utils/faceDescriptor';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fams-development-only-secret-change-me';
const pairingRate = new Map<string, { count: number; resetAt: number }>();

// ─────────────────────────────────────────────────────────────────
// Helper: verify that a request comes from either an admin user JWT
// or a valid registered mobile terminal token.
// ─────────────────────────────────────────────────────────────────
async function verifyTerminalOrAdmin(req: Request): Promise<{ valid: boolean; actor: string; terminalId?: string }> {
  const token = getRequestToken(req);
  if (!token) return { valid: false, actor: '' };

  // 1. Try user JWT first
  try {
    const user = jwt.verify(token, JWT_SECRET) as any;
    return { valid: true, actor: user.username };
  } catch (_) {}

  // 2. Try mobile terminal token
  try {
    const terminal = await prisma.mobileTerminal.findFirst({
      where: { OR: [{ tokenHash: hashTerminalToken(token) }, { token }] },
    });
    if (terminal && terminal.status === 'active') {
      if (terminal.lastTokenRotatedAt && terminal.lastTokenRotatedAt.getTime() > Date.now()) {
        return { valid: false, actor: '' };
      }
      return { valid: true, actor: `Terminal:${terminal.name}`, terminalId: terminal.id };
    }
  } catch (_) {}

  return { valid: false, actor: '' };
}

// ─────────────────────────────────────────────────────────────────
// POST /api/terminals/register
// Called by a new APK device to pair with the FAMS server.
// Requires a valid 6-digit pairing code that was generated on
// the web dashboard (Admin panel → Terminals → Generate Code).
// Returns a long-lived terminal JWT token and the terminal record.
// ─────────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  const { pairingCode, name, deviceModel } = req.body;

  if (!pairingCode || !name) {
    return res.status(400).json({ error: 'pairingCode and name are required' });
  }

  const ip = getIp(req);
  const now = Date.now();
  const bucket = pairingRate.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    pairingRate.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else if (bucket.count >= 10) {
    return res.status(429).json({ error: 'Too many pairing attempts. Try again later.' });
  } else {
    bucket.count += 1;
  }

  try {
    const terminal = await prisma.mobileTerminal.findUnique({ where: { pairingCode } });

    if (!terminal) {
      return res.status(404).json({ error: 'Invalid or expired pairing code' });
    }
    if (terminal.status !== 'pending') {
      return res.status(409).json({ error: 'This pairing code has already been used or revoked' });
    }
    if (terminal.pairingExpiresAt && terminal.pairingExpiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: 'Pairing code expired. Generate a new code from the admin dashboard.' });
    }
    if (terminal.pairingAttempts >= 5) {
      return res.status(429).json({ error: 'Pairing code locked. Generate a new code from the admin dashboard.' });
    }

    // Generate a secure long-lived token for the terminal
    const terminalToken = `fams-terminal-${crypto.randomBytes(32).toString('hex')}`;

    const updated = await prisma.mobileTerminal.update({
      where: { id: terminal.id },
      data: {
        name,
        deviceModel: deviceModel ?? null,
        token: null,
        tokenHash: hashTerminalToken(terminalToken),
        status: 'active',
        lastSeenAt: new Date(),
        lastTokenRotatedAt: new Date(),
        pairingAttempts: { increment: 1 },
        bluetoothUuid: `fams-${terminal.id.slice(-8)}`, // deterministic BLE UUID suffix
      },
    });

    await writeAuditLog({
      actor: 'Mobile Terminal',
      action: 'Terminal Registered',
      target: name,
      details: `Device "${name}" (${deviceModel ?? 'Unknown model'}) paired using a one-time pairing code.`,
      ipAddress: getIp(req),
    });

    res.status(201).json({
      terminalId: updated.id,
      token: terminalToken,
      name: updated.name,
      bluetoothUuid: updated.bluetoothUuid,
      message: 'Terminal successfully registered',
    });
  } catch (err: any) {
    console.error('[Terminal Register Error]', err);
    res.status(500).json({ error: 'Failed to register terminal: ' + (err.message || 'Unknown error') });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/terminals/generate-code
// Admin creates a new "pending" terminal slot with a pairing code.
// The code is displayed as a QR on the web dashboard for scanning.
// ─────────────────────────────────────────────────────────────────
router.post('/generate-code', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Terminal name is required' });
  }

  try {
    // Generate a short 6-digit numeric pairing code (easy to type manually)
    const pairingCode = String(crypto.randomInt(100000, 1000000));

    // Temporary placeholder token (replaced on successful pairing)
    const placeholderToken = `fams-pending-${crypto.randomBytes(8).toString('hex')}`;

    const terminal = await prisma.mobileTerminal.create({
      data: {
        name,
        pairingCode,
        token: null,
        tokenHash: hashTerminalToken(placeholderToken),
        status: 'pending',
        pairingExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        pairingAttempts: 0,
      },
    });

    await writeAuditLog({
      actor: (req as any).user?.username || 'Admin',
      action: 'Terminal Pairing Code Generated',
      target: name,
      details: `Generated pairing code for new terminal slot "${name}" with a 10-minute expiry.`,
      ipAddress: getIp(req),
    });

    res.status(201).json({
      terminalId: terminal.id,
      pairingCode,
      name: terminal.name,
      status: terminal.status,
      message: 'Scan the QR code or enter the pairing code on your mobile device',
    });
  } catch (err: any) {
    console.error('[Generate Code Error]', err);
    res.status(500).json({ error: 'Failed to generate pairing code: ' + (err.message || 'Unknown error') });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/terminals/heartbeat
// Called by the APK every ~60 seconds to report device health.
// Payload: { batteryLevel, networkQuality, pendingQueueSize }
// ─────────────────────────────────────────────────────────────────
router.post('/heartbeat', authenticateToken, requireTerminal, async (req: Request, res: Response) => {
  const auth = (req as any).user;
  if (!auth?.terminalId) return res.status(401).json({ error: 'Valid terminal token required for heartbeat' });

  const { batteryLevel, networkQuality, pendingQueueSize } = req.body;

  try {
    const updated = await prisma.mobileTerminal.update({
      where: { id: auth.terminalId },
      data: {
        batteryLevel: batteryLevel != null ? Number(batteryLevel) : undefined,
        networkQuality: networkQuality ?? undefined,
        pendingQueueSize: pendingQueueSize != null ? Number(pendingQueueSize) : undefined,
        lastSeenAt: new Date(),
      },
    });

    // Emit real-time update to web dashboard via WebSocket
    try {
      const { getIO } = require('../socket');
      getIO().emit('terminal_heartbeat', {
        id: updated.id,
        name: updated.name,
        batteryLevel: updated.batteryLevel,
        networkQuality: updated.networkQuality,
        pendingQueueSize: updated.pendingQueueSize,
        lastSeenAt: updated.lastSeenAt,
      });
    } catch (_) {}

    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Heartbeat Error]', err);
    res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

// GET /api/terminals/sync-pack
// Mobile kiosk: pull workers + face descriptors from laptop server (terminal token auth)
router.get('/sync-pack', authenticateToken, requireTerminal, async (req: Request, res: Response) => {
  const auth = (req as any).user;
  if (!auth?.terminalId) {
    return res.status(401).json({ error: 'Valid terminal token required. Re-pair this device from the web dashboard.' });
  }

  try {
    const workers = await prisma.worker.findMany({
      where: { isActive: true },
      select: {
        employeeCode: true,
        name: true,
        department: true,
        avatarPhoto: true,
      },
      orderBy: { employeeCode: 'asc' },
    });

    const withFaces = await prisma.worker.findMany({
      where: { isActive: true, faceDescriptor: { not: null } },
      select: { employeeCode: true, name: true, faceDescriptor: true },
    });

    const faces = withFaces
      .map(w => {
        const descriptors = parseFaceDescriptors(w.faceDescriptor);
        if (descriptors.length === 0) return null;
        return {
          employeeCode: w.employeeCode,
          name: w.name,
          descriptor: descriptors[0],
          descriptors,
        };
      })
      .filter(Boolean);

    res.json({
      serverTime: new Date().toISOString(),
      workerCount: workers.length,
      faceCount: faces.length,
      workers,
      faces,
      settings: await getMobileSettingsPack(),
    });
  } catch (err: any) {
    console.error('[Sync Pack Error]', err);
    res.status(500).json({ error: 'Failed to build sync pack: ' + (err.message || 'Unknown error') });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/terminals
// Admin: list all registered terminals with live health status
// ─────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const terminals = await prisma.mobileTerminal.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        deviceModel: true,
        bluetoothUuid: true,
        status: true,
        batteryLevel: true,
        networkQuality: true,
        pendingQueueSize: true,
        lastSeenAt: true,
        createdAt: true,
        // Do NOT expose pairingCode or token in list view
        _count: { select: { attendanceEvents: true } },
      },
    });

    // Mark terminals offline using configured timeout
    const settings = await getSettingsMap();
    const offlineMins = Number(settings.mobile_offline_timeout_min || 5);
    const OFFLINE_THRESHOLD_MS = offlineMins * 60 * 1000;
    const now = Date.now();
    const enriched = terminals.map((t: any) => ({
      ...t,
      isOnline: t.lastSeenAt ? (now - new Date(t.lastSeenAt).getTime()) < OFFLINE_THRESHOLD_MS : false,
      totalScans: t._count.attendanceEvents,
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch terminals: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/terminals/:id
// Admin: revoke a terminal (it can no longer sync or log scans)
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const terminal = await prisma.mobileTerminal.findUnique({ where: { id } });
    if (!terminal) return res.status(404).json({ error: 'Terminal not found' });

    await prisma.mobileTerminal.update({
      where: { id },
      data: { status: 'revoked' },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'Terminal Revoked',
        target: terminal.name,
        details: `Mobile terminal "${terminal.name}" (${id}) has been revoked and can no longer sync attendance data.`,
        ipAddress: getIp(req),
      },
    });

    res.json({ message: `Terminal "${terminal.name}" has been revoked` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to revoke terminal: ' + err.message });
  }
});

export default router;

async function getMobileSettingsPack() {
  const s = await getSettingsMap();
  return {
    ai_threshold: s.ai_threshold,
    mobile_sync_interval_sec: s.mobile_sync_interval_sec,
    mobile_heartbeat_interval_sec: s.mobile_heartbeat_interval_sec,
    mobile_offline_queue_max: s.mobile_offline_queue_max,
    mobile_offline_timeout_min: s.mobile_offline_timeout_min,
    mobile_tts_enabled: s.mobile_tts_enabled,
    mobile_pin_override_enabled: s.mobile_pin_override_enabled,
    mobile_auto_sync_on_wifi: s.mobile_auto_sync_on_wifi,
    mobile_face_model: s.mobile_face_model,
    mobile_ble_enabled: s.mobile_ble_enabled,
    mobile_ble_broadcast_name: s.mobile_ble_broadcast_name,
    teaBreakDuration: s.teaBreakDuration,
    lunchBreakDuration: s.lunchBreakDuration,
    standardWorkHours: s.standardWorkHours,
    overtimeThreshold: s.overtimeThreshold,
  };
}
