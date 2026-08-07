import * as fs from 'fs';
import * as path from 'path';
import prisma from '../db';
import { getSettingsMap } from './settingsCache';
import { buildPayrollSettings, computeDailyPay } from './payrollRules';
import { getTodayWorkDate } from './workDate';
import { sendWebhookNotification } from './notifications';

const EXPORTS_DIR = path.join(__dirname, '..', '..', 'exports');

export async function generatePayrollExportFile(
  period: string,
  format: string,
): Promise<{ filename: string; filepath: string; workerCount: number }> {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  const settings = await getSettingsMap();
  const ps = buildPayrollSettings(settings);
  const workDate = await getTodayWorkDate();

  const workers = await prisma.worker.findMany({
    where: { isActive: true },
    include: {
      attendanceEvents: {
        where: { workDate },
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  const rows = workers.map((w) => {
    const events = w.attendanceEvents;
    let workedHours = 0;
    let checkIn: Date | null = null;
    for (const e of events) {
      if (e.eventType === 'checked-in') checkIn = new Date(e.timestamp);
      if (e.eventType === 'checked-out' && checkIn) {
        workedHours += (new Date(e.timestamp).getTime() - checkIn.getTime()) / 3600000;
        checkIn = null;
      }
    }
    if (checkIn) {
      workedHours += (Date.now() - checkIn.getTime()) / 3600000;
    }
    const pay = computeDailyPay(workedHours, workDate, w, ps);
    return {
      employeeCode: w.employeeCode,
      name: w.name,
      department: w.department,
      workedHours: workedHours.toFixed(2),
      basePay: pay.basePay,
      otHours: pay.otHours,
      otPay: pay.otPay,
      gross: pay.gross,
      tax: pay.tax,
      net: pay.net,
    };
  });

  const safePeriod = period.replace(/[^\w\-–, ]/g, '').slice(0, 60);
  const ext = format.toLowerCase() === 'pdf' ? 'txt' : 'csv';
  const filename = `payroll_${safePeriod.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
  const filepath = path.join(EXPORTS_DIR, filename);

  if (ext === 'csv') {
    const header = 'employeeCode,name,department,workedHours,basePay,otHours,otPay,gross,tax,net,currency\n';
    const body = rows
      .map(
        (r) =>
          `${r.employeeCode},"${r.name}",${r.department},${r.workedHours},${r.basePay},${r.otHours},${r.otPay},${r.gross},${r.tax},${r.net},${settings.payroll_currency || 'USD'}`,
      )
      .join('\n');
    fs.writeFileSync(filepath, header + body, 'utf-8');
  } else {
    const lines = [
      `FAMS Payroll Export — ${period}`,
      `Generated: ${new Date().toISOString()}`,
      `Currency: ${settings.payroll_currency || 'USD'}`,
      '',
      ...rows.map(
        (r) =>
          `${r.employeeCode} | ${r.name} | ${r.department} | ${r.workedHours}h | gross ${r.gross} | net ${r.net}`,
      ),
    ];
    fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
  }

  return { filename, filepath, workerCount: rows.length };
}

/** Check shifts past end time without check-out — fire missed punch alerts. */
export async function checkMissedPunches(): Promise<void> {
  const settings = await getSettingsMap();
  if (settings.notif_missed_punch !== 'true') return;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const shifts = await prisma.shift.findMany();
  const activeShift = shifts.find((s) => s.endTime <= currentTime && s.startTime <= currentTime);
  if (!activeShift) return;

  const workDate = await getTodayWorkDate();
  const openWorkers = await prisma.worker.findMany({
    where: { isActive: true, shiftId: activeShift.id },
    include: {
      attendanceEvents: { where: { workDate }, orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });

  const missed = openWorkers.filter((w) => {
    const last = w.attendanceEvents[0];
    return last && ['checked-in', 'tea-break', 'lunch-break'].includes(last.eventType);
  });

  if (missed.length > 0) {
    await sendWebhookNotification(
      'notif_missed_punch',
      `⏰ **Missed Punch Alert**\n${missed.length} worker(s) still checked in after shift \`${activeShift.name}\` ended at ${activeShift.endTime}.`,
    );
  }
}

/** Compliance logs are never deleted by background maintenance. Archive them
 * through an explicit, separately retained export process instead. */
export async function enforceAuditRetention(): Promise<void> {
  return;
}

/** Scrub biometrics for inactive workers past bio_retention_days. */
export async function enforceBiometricRetention(): Promise<void> {
  const settings = await getSettingsMap();
  if (settings.bio_auto_delete !== 'true') return;
  const days = Number(settings.bio_retention_days || 365);
  const cutoff = new Date(Date.now() - days * 86400000);
  await prisma.worker.updateMany({
    where: { isActive: false, updatedAt: { lt: cutoff }, faceDescriptor: { not: null } },
    data: { faceDescriptor: null, avatarPhoto: null },
  });
}

export function initMaintenanceSchedulers(): void {
  setInterval(() => {
    checkMissedPunches().catch(console.error);
    enforceBiometricRetention().catch(console.error);
  }, 15 * 60 * 1000);

  console.log('🔧 [Maintenance] Schedulers initialized (missed punch, bio retention)');
}
