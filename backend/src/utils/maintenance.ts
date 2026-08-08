import * as fs from 'fs';
import * as path from 'path';
import {
  buildSalaryPeriodReport,
  resolvePeriodBounds,
  type SalaryPeriodReport,
} from './salaryPeriod';
import { getSettingsMap } from './settingsCache';
import { getTodayWorkDate } from './workDate';
import { sendWebhookNotification } from './notifications';

const EXPORTS_DIR = path.join(__dirname, '..', '..', 'exports');

export function getExportsDir() {
  return EXPORTS_DIR;
}

export function snapshotPathFor(csvFilename: string) {
  return path.join(EXPORTS_DIR, `${csvFilename}.snapshot.json`);
}

export async function generatePayrollExportFile(opts: {
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  format?: string;
}): Promise<{
  filename: string;
  filepath: string;
  snapshotPath: string;
  workerCount: number;
  periodLabel: string;
  from: string;
  to: string;
  report: SalaryPeriodReport;
}> {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  const settings = await getSettingsMap();
  const todayWorkDate = await getTodayWorkDate();
  const bounds = resolvePeriodBounds({
    period: opts.period,
    month: opts.month,
    from: opts.from,
    to: opts.to,
    payrollPeriod: settings.payroll_period || 'monthly',
    todayWorkDate,
  });

  const report = await buildSalaryPeriodReport({
    from: bounds.from,
    to: bounds.to,
    periodLabel: bounds.label,
  });

  const currency = report.currency || 'INR';
  const safePeriod = bounds.label.replace(/[^\w\-–, ]/g, '').slice(0, 60);
  const filename = `payroll_${safePeriod.replace(/\s+/g, '_')}_${Date.now()}.csv`;
  const filepath = path.join(EXPORTS_DIR, filename);
  const snapPath = snapshotPathFor(filename);

  const header =
    'employeeCode,name,department,daysPresent,incompleteDays,regularHours,otHours,basePay,otPay,gross,tax,net,currency\n';
  const body = report.records
    .map(
      (r) =>
        `${r.employeeCode},"${r.name.replace(/"/g, '""')}",${r.department},${r.daysPresent},${r.incompleteDays},${r.totalRegularHours},${r.overtimeHours},${r.baseSalary},${r.overtimePay},${r.salary},${r.tax},${r.net},${currency}`,
    )
    .join('\n');
  fs.writeFileSync(filepath, header + body, 'utf-8');
  fs.writeFileSync(snapPath, JSON.stringify(report, null, 2), 'utf-8');

  return {
    filename,
    filepath,
    snapshotPath: snapPath,
    workerCount: report.records.length,
    periodLabel: bounds.label,
    from: bounds.from,
    to: bounds.to,
    report,
  };
}

/** Check shifts past end time without check-out — fire missed punch alerts. */
export async function checkMissedPunches(): Promise<void> {
  const settings = await getSettingsMap();
  if (settings.notif_missed_punch !== 'true') return;

  const prisma = (await import('../db')).default;
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
  const prisma = (await import('../db')).default;
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
