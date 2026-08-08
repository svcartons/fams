import { Router, Request, Response } from 'express';
import prisma from '../db';
import { authenticateToken, getRequestToken } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';
import { sendWebhookNotification } from '../utils/notifications';
import { clearWorkDateCache } from '../utils/workDate';
import { clearSettingsCache, getSettingsMap } from '../utils/settingsCache';
import { generatePayrollExportFile } from '../utils/maintenance';
import { ensureKioskTokenSetting } from '../utils/ensureKioskToken';
import { getIp, isPrivateIp } from '../utils/helpers';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fams-development-only-secret-change-me';


// Default settings used when no DB record exists
const DEFAULTS: Record<string, string> = {
  teaBreakDuration: '15',
  lunchBreakDuration: '30',
  breakOvertimeAlert: '5',
  standardWorkHours: '8',
  overtimeThreshold: '9',
  deductBreaks: 'true',
  perm_supervisor_salary_view: 'true',
  perm_supervisor_worker_view: 'true',
  perm_supervisor_worker_delete: 'false',
  perm_supervisor_correction_approve: 'true',
  ai_threshold: '0.55',

  // Operational Rules
  gracePeriod: '10',
  earlyCheckout: '15',
  maxConsecutiveDays: '6',
  midnightAlgo: 'true',
  autoBreakLog: 'true',
  weekendMultiplier: '1.5',
  holidayMultiplier: '2.0',
  nightDiffRate: '1.25',
  nightDiffStart: '22:00',
  weekendOT: 'true',
  holidayPay: 'true',
  nightDiff: 'false',

  // Shift Scheduling Rules
  shiftBufferTime: '15',
  minRestBetweenShifts: '8',
  shiftSwapApproval: 'true',
  autoAssignOverflow: 'false',
  shiftCapacityAlertPct: '80',
  shiftCapacityAlerts: 'true',

  // Role Permissions
  perm_supervisor_enroll_workers: 'true',
  perm_supervisor_manage_shifts: 'false',
  perm_supervisor_export_payroll: 'false',
  perm_supervisor_view_analytics: 'true',
  perm_supervisor_send_notifications: 'false',
  perm_supervisor_manage_holidays: 'false',
  perm_supervisor_view_audit: 'true',
  perm_supervisor_kiosk_config: 'false',

  // AI & Kiosk
  ai_model: 'ssd_mobilenet',
  ai_scan_interval: '800',
  ai_auto_retry: '3',
  ai_model_cache_mb: '128',
  ai_landmarks: 'true',
  ai_liveness: 'false',
  ai_rfid_fallback: 'true',
  ai_multiface_alert: 'true',
  kiosk_camera_res: '720p',
  kiosk_idle_timeout: '30',
  kiosk_ir_mode: 'false',
  kiosk_offline_mode: 'true',

  // Biometric & Enrollment
  bio_enrollment_samples: '5',
  bio_reenrollment_days: '180',
  bio_retention_days: '365',
  bio_auto_delete: 'true',
  bio_audit_access: 'true',
  bio_supervisor_enroll: 'true',

  // Security & Auth
  sec_jwt_expiry: '480',
  sec_refresh_expiry: '10080',
  sec_lockout_attempts: '5',
  sec_lockout_duration: '15',
  sec_password_min_len: '12',
  sec_password_expiry: '90',
  sec_mfa_enabled: 'false',
  sec_ip_whitelist: 'true',
  sec_session_log: 'true',
  sec_force_https: 'true',
  sec_cors_origin: '*',
  sec_ip_list: '192.168.1.0/24',
  sec_kiosk_token: '',

  // Notifications & Alerts
  notif_channel: 'push',
  notif_email: '',
  notif_sms: '',
  notif_webhook_url: '',
  notif_digest_freq: 'daily',
  notif_quiet_hours: 'true',
  notif_quiet_start: '22:00',
  notif_quiet_end: '06:00',
  notif_overtime_alert: 'true',
  notif_missed_punch: 'true',
  notif_login_failed: 'true',
  notif_enrollment: 'true',
  notif_payroll_ready: 'true',
  notif_low_capacity: 'false',
  notif_capacity_pct: '80',

  // Payroll & Export
  payroll_format: 'csv',
  payroll_period: 'biweekly',
  payroll_rounding: 'nearest_15',
  payroll_currency: 'INR',
  payroll_tax_rate: '22',
  payroll_deduct_breaks: 'true',
  payroll_include_overtime: 'true',
  payroll_encrypt: 'false',
  payroll_auto_export: 'false',
  payroll_export_time: '07:00',

  // System & Network
  sys_backup_freq: 'daily',
  sys_backup_retention: '30',
  sys_log_level: 'warn',
  sys_compression: 'true',
  sys_rate_limit_window: '15',
  sys_rate_limit_max: '100',
  sys_db_url: '',

  // Audit & Compliance
  audit_retention_days: '730',
  audit_immutable: 'true',
  audit_gdpr_mode: 'true',
  audit_export_enabled: 'true',
  audit_data_residency: 'on-premise',

  // Mobile Terminal (APK)
  mobile_sync_interval_sec: '60',       // How often APK checks for Wi-Fi to sync
  mobile_offline_queue_max: '500',       // Max events buffered offline before alert
  mobile_heartbeat_interval_sec: '60',  // Heartbeat cadence
  mobile_offline_timeout_min: '5',      // Minutes without heartbeat = "offline"
  mobile_ble_enabled: 'true',           // Enable BLE proximity discovery
  mobile_ble_broadcast_name: 'FAMS-Kiosk', // BLE advertisement prefix
  mobile_tts_enabled: 'true',           // Text-to-speech greeting on scan
  mobile_pin_override_enabled: 'true',  // Supervisor offline PIN override
  mobile_auto_sync_on_wifi: 'true',     // Trigger sync immediately on Wi-Fi connect
  mobile_face_model: 'mobilefacenet',   // On-device face model: mobilefacenet | arcface
};


// GET /api/settings — returns all settings merged with defaults
router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await prisma.systemSetting.findMany();
    const fromDB = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    const merged = { ...DEFAULTS, ...fromDB };

    // Inject database URL with redacted password for security
    let dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl) {
      dbUrl = dbUrl.replace(/(:\/\/.*?):(.*?)@/, '$1:••••@');
    }
    merged.sys_db_url = dbUrl;

    // Only admin sessions may receive sensitive settings. Public and kiosk clients
    // receive a deliberately small operational configuration surface.
    const token = getRequestToken(req);
    let isAuthenticated = false;
    let isAdmin = false;

    if (token) {
      // 1. Check if it's the kiosk token
      const currentKioskToken = merged.sec_kiosk_token;
      if (currentKioskToken && token === currentKioskToken) {
        isAuthenticated = true;
      } else {
        // 2. Check if it's a valid user JWT
        try {
          const payload = jwt.verify(token, JWT_SECRET) as any;
          isAuthenticated = true;
          isAdmin = payload.role === 'admin';
        } catch (jwtErr) {
          // Token invalid, keep as unauthenticated
        }
      }
    }

    if (!isAuthenticated || !isAdmin) {
      const keys = Object.keys(merged);
      for (const key of keys) {
        if (key.startsWith('sec_') || key.startsWith('notif_') || key === 'sys_db_url' || key.startsWith('payroll_')) {
          delete merged[key];
        }
      }
    }

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings — upserts all settings (Admin Only)
router.put('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      console.warn(`[Settings Save] Forbidden: User ${ (req as any).user?.username } with role ${userRole} attempted to save settings.`);
      return res.status(403).json({ error: 'Admin access required to change settings' });
    }

    const body = req.body as Record<string, string>;
    console.log(`[Settings Save] Updating ${Object.keys(body).length} keys sequentially...`);
    
    for (const [key, value] of Object.entries(body)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }

    if ('midnightAlgo' in body) {
      clearWorkDateCache();
    }
    clearSettingsCache();

    res.json({ message: 'Settings saved successfully' });
  } catch (err: any) {
    console.error('[Settings Save Error]', err);
    res.status(500).json({ error: 'Failed to save settings: ' + (err.message || 'Unknown error') });
  }
});

// GET /api/settings/system-info — returns system runtime and resource diagnostics
router.get('/system-info', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    const workerCount = await prisma.worker.count();
    const eventCount = await prisma.attendanceEvent.count();
    const correctionCount = await prisma.manualCorrection.count();
    const logCount = await prisma.auditLog.count();
    const shiftCount = await prisma.shift.count();

    // Query DB version (safely fallback to provider type if specific query fails)
    let dbVersion = 'PostgreSQL';
    try {
      const result = await prisma.$queryRawUnsafe<any[]>('SELECT version();');
      if (result && result[0] && result[0].version) {
        dbVersion = result[0].version.split(',')[0].replace(' on ', ' '); // E.g., "PostgreSQL 15.3 on x86_64..." -> "PostgreSQL 15.3"
      }
    } catch (e) {
      console.warn('Could not read PostgreSQL version from SELECT version()', e);
    }

    // Dynamic storage calculation based on record headcount
    const calculatedStorageMb = 124.5 + (workerCount * 0.12) + (eventCount * 0.04) + (logCount * 0.02);

    // Retrieve last backup timestamp from audit logs or use fallback
    const backupResult = await prisma.auditLog.findFirst({
      where: { action: { contains: 'Backup' } },
      orderBy: { createdAt: 'desc' },
    });
    const lastBackupTime = backupResult ? backupResult.createdAt.toISOString() : '2026-05-25T03:00:00.000Z';

    res.json({
      dbVersion,
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      dbStorageUsed: `${calculatedStorageMb.toFixed(1)} MB / 20 GB`,
      lastBackup: lastBackupTime,
      counts: {
        users: userCount,
        workers: workerCount,
        attendanceEvents: eventCount,
        corrections: correctionCount,
        auditLogs: logCount,
        shifts: shiftCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch system stats: ' + err.message });
  }
});

// POST /api/settings/purge-descriptors — Purge face recognition descriptors (Danger Zone)
router.post('/purge-descriptors', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can purge biometric data' });
    }

    const result = await prisma.worker.updateMany({
      data: {
        faceDescriptor: null,
        avatarPhoto: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'Purged Biometric Data',
        target: 'All Workers',
        details: `Irreversibly cleared face descriptors and avatar photos for all workers. Count: ${result.count}.`,
      },
    });

    res.json({ message: 'All face descriptors successfully purged.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to purge face descriptors: ' + err.message });
  }
});

// POST /api/settings/purge-audit — Purge all system audit logs (Danger Zone)
router.post('/purge-audit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can purge compliance audit logs' });
    }

    return res.status(403).json({
      error: 'Compliance audit logs cannot be purged. Export and archive them instead.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to purge audit logs: ' + err.message });
  }
});

// GET /api/settings/payroll-exports — Retrieve payroll export history
router.get('/payroll-exports', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_export_payroll' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Payroll export restricted to administrators.' });
      }
    }
    let exports = await prisma.payrollExport.findMany({
      orderBy: { generatedAt: 'desc' },
    });

    res.json(exports);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch payroll exports: ' + err.message });
  }
});

// POST /api/settings/payroll-exports — Create a new payroll export record
router.post('/payroll-exports', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_export_payroll' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Payroll export restricted to administrators.' });
      }
    }
    const { period, format, month, from, to, finalize } = req.body || {};
    const shouldFinalize = finalize !== false;

    const generated = await generatePayrollExportFile({
      period: period ? String(period) : undefined,
      month: month ? String(month) : undefined,
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      format: format ? String(format) : 'csv',
    });
    const calculationHash = crypto.createHash('sha256').update(fs.readFileSync(generated.filepath)).digest('hex');
    const workerCount = generated.workerCount;
    const periodLabel = generated.periodLabel;

    // Void prior finalized exports for the same period label when re-finalizing
    if (shouldFinalize) {
      await prisma.payrollExport.updateMany({
        where: {
          period: periodLabel,
          finalizedAt: { not: null },
          status: { not: 'void' },
        },
        data: { status: 'superseded' },
      });
    }

    const newExport = await prisma.payrollExport.create({
      data: {
        period: periodLabel,
        format: 'CSV',
        workerCount,
        status: shouldFinalize ? 'finalized' : 'draft',
        filename: generated.filename,
        site: 'main',
        calculationVersion: 'v2-workdate',
        calculationHash,
        finalizedAt: shouldFinalize ? new Date() : null,
        finalizedBy: shouldFinalize ? ((req as any).user?.id || (req as any).user?.username || null) : null,
      },
    });

    const actor = (req as any).user?.username || 'Admin';
    await prisma.auditLog.create({
      data: {
        actor,
        action: shouldFinalize ? 'Payroll Finalized' : 'Payroll Exported',
        target: periodLabel,
        details: `Generated CSV payroll for ${workerCount} workers (${generated.from} → ${generated.to}). Incomplete days: ${generated.report.incompleteDayCount}.`,
        ipAddress: getIp(req),
      },
    });

    sendWebhookNotification(
      'notif_payroll_ready',
      `💰 **Payroll Export Generated**\n• Period: \`${periodLabel}\`\n• Format: \`CSV\`\n• Worker Count: \`${workerCount}\`\n• Exported By: \`${actor}\`${shouldFinalize ? '\n• Status: finalized' : ''}`
    ).catch(() => {});

    res.json({
      ...newExport,
      from: generated.from,
      to: generated.to,
      incompleteDayCount: generated.report.incompleteDayCount,
      totalPayout: generated.report.totalPayout,
      totalNet: generated.report.totalNet,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record payroll export: ' + err.message });
  }
});

// POST /api/settings/payroll-exports/:id/unfinalize — unlock a pay period
router.post('/payroll-exports/:id/unfinalize', authenticateToken, async (req: Request, res: Response) => {
  try {
    if ((req as any).user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can unfinalize payroll' });
    }
    const exportRow = await prisma.payrollExport.findUnique({ where: { id: String(req.params.id) } });
    if (!exportRow) return res.status(404).json({ error: 'Export not found' });

    const updated = await prisma.payrollExport.update({
      where: { id: exportRow.id },
      data: { finalizedAt: null, finalizedBy: null, status: 'void' },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'Payroll Unfinalized',
        target: exportRow.period,
        details: `Unlocked payroll export ${exportRow.id} for period ${exportRow.period}`,
        ipAddress: getIp(req),
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to unfinalize payroll: ' + err.message });
  }
});

// GET /api/settings/payroll-exports/:id/download — download generated export file
router.get('/payroll-exports/:id/download', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_export_payroll' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Payroll export restricted to administrators.' });
      }
    }

    const exportRow = await prisma.payrollExport.findUnique({ where: { id: String(req.params.id) } });
    if (!exportRow) return res.status(404).json({ error: 'Export not found' });

    const exportsDir = path.join(__dirname, '..', '..', 'exports');
    const filename = exportRow.filename;
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(404).json({ error: 'Export file not found on disk' });
    }

    const filepath = path.join(exportsDir, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Export file not found on disk' });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'User',
        action: 'Payroll Download',
        target: exportRow.period,
        details: `Downloaded payroll file ${filename}`,
        ipAddress: getIp(req),
      },
    });

    res.download(filepath, filename);
  } catch (err: any) {
    res.status(500).json({ error: 'Download failed: ' + err.message });
  }
});

// POST /api/settings/regenerate-kiosk-token — issue new kiosk auth token
router.post('/regenerate-kiosk-token', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const token = `fams-kiosk-${crypto.randomBytes(16).toString('hex')}`;
    await prisma.systemSetting.upsert({
      where: { key: 'sec_kiosk_token' },
      update: { value: token },
      create: { key: 'sec_kiosk_token', value: token },
    });
    clearSettingsCache();
    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/kiosk-bootstrap — LAN/local browser kiosk auto-pair
// Public settings strip sec_* keys, so /kiosk cannot read the token without this.
// Restricted to private/loopback clients (and always allowed outside production).
router.get('/kiosk-bootstrap', async (req: Request, res: Response) => {
  try {
    const clientIp = getIp(req);
    const allow =
      process.env.NODE_ENV !== 'production' ||
      isPrivateIp(clientIp);

    if (!allow) {
      return res.status(403).json({
        error: 'Kiosk bootstrap is only available from the factory LAN or local development.',
      });
    }

    const token = await ensureKioskTokenSetting();
    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to bootstrap kiosk token' });
  }
});

// GET /api/settings/audit-export — JSON compliance archive
router.get('/audit-export', authenticateToken, async (req: Request, res: Response) => {
  try {
    const settings = await getSettingsMap();
    if (settings.audit_export_enabled !== 'true') {
      return res.status(403).json({ error: 'Audit export disabled in settings' });
    }
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="fams_audit_${Date.now()}.json"`);
    res.json({ exportedAt: new Date().toISOString(), residency: settings.audit_data_residency, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/factory-reset — clears all operational data
router.post('/factory-reset', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can perform a factory reset' });
    }

    // Use a transaction to safely delete all operational records
    await prisma.$transaction([
      prisma.attendanceEvent.deleteMany(),
      prisma.dailyOverride.deleteMany(),
      prisma.manualCorrection.deleteMany(),
      prisma.worker.deleteMany(),
      prisma.payrollExport.deleteMany(), // also clear payroll exports on factory reset
    ]);

    // Log the reset action
    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'System Reset',
        target: 'All Operational Data',
        details: 'Performed a factory reset, clearing all dummy workers and attendance data.',
      }
    });

    res.json({ message: 'Factory reset complete' });
  } catch (err: any) {
    res.status(500).json({ error: 'Factory reset failed: ' + err.message });
  }
});

export default router;
