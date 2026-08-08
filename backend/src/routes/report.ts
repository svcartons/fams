import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getIp } from '../utils/helpers';
import { getTodayWorkDate, useMidnightRollover, workDateToUtcRange } from '../utils/workDate';
import { getSettingsMap } from '../utils/settingsCache';
import { buildPayrollSettings } from '../utils/payrollRules';
import { computeDayWork } from '../utils/attendanceCalc';
import {
  assertWorkDateEditable,
  buildSalaryPeriodReport,
  resolvePeriodBounds,
} from '../utils/salaryPeriod';

const router = Router();

async function getPayrollSettings() {
  const settings = await getSettingsMap();
  return buildPayrollSettings(settings);
}

function breakSettings(ps: Awaited<ReturnType<typeof getPayrollSettings>>) {
  return {
    deductBreaks: ps.deductBreaks,
    teaBreakDurationMs: ps.teaBreakDurationMs,
    lunchBreakDurationMs: ps.lunchBreakDurationMs,
  };
}

function buildDaySummaryForWorkers(
  workers: Array<{ attendanceEvents: Array<{ eventType: string; timestamp: Date }> }>,
  settings: ReturnType<typeof breakSettings>,
  capAtNow: boolean,
) {
  let complete = 0;
  let incomplete = 0;
  let absent = 0;
  let present = 0;

  for (const w of workers) {
    const day = computeDayWork(w.attendanceEvents, settings, capAtNow);
    if (day.status === 'absent') absent += 1;
    else if (day.status === 'complete') {
      complete += 1;
      present += 1;
    } else {
      incomplete += 1;
      present += 1;
    }
  }

  const total = workers.length;
  const attendancePct = total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0;

  return { total, complete, incomplete, absent, present, attendancePct };
}

// GET /api/report/daily?date=YYYY-MM-DD
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const workDateStr =
      dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/) ? dateStr : await getTodayWorkDate();

    const midnight = await useMidnightRollover();
    const { start: startOfDay, end: endOfDay } = workDateToUtcRange(workDateStr, midnight);
    const ps = await getPayrollSettings();
    const bs = breakSettings(ps);
    const isToday = workDateStr === await getTodayWorkDate();

    const workers = await prisma.worker.findMany({
      where: {
        OR: [
          { isActive: true },
          { attendanceEvents: { some: { workDate: workDateStr } } },
        ],
      },
      include: {
        attendanceEvents: {
          where: { workDate: workDateStr },
          orderBy: { timestamp: 'asc' },
        },
      },
      orderBy: { employeeCode: 'asc' },
    });

    const fmtTime = (d: Date) =>
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    const durationStr = (ms: number) => {
      const mins = Math.floor(ms / 60000);
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    };

    const records = workers.map((w) => {
      const events = w.attendanceEvents;
      const checkInEvent = events.find((e) => e.eventType === 'checked-in');
      const checkOutEvent = [...events].reverse().find((e) => e.eventType === 'checked-out');
      const teaEvent = events.find((e) => e.eventType === 'tea-break');
      const lunchEvent = events.find((e) => e.eventType === 'lunch-break');

      let totalPresenceMs = 0;
      let currentCheckIn: Date | null = null;
      for (const e of events) {
        if (e.eventType === 'checked-in') {
          if (!currentCheckIn) currentCheckIn = new Date(e.timestamp);
        } else if (e.eventType === 'checked-out' && currentCheckIn) {
          const overlapStart = Math.max(currentCheckIn.getTime(), startOfDay.getTime());
          const overlapEnd = Math.min(new Date(e.timestamp).getTime(), endOfDay.getTime());
          if (overlapEnd > overlapStart) totalPresenceMs += overlapEnd - overlapStart;
          currentCheckIn = null;
        }
      }
      if (currentCheckIn) {
        const cap = isToday ? new Date() : endOfDay;
        const overlapStart = Math.max(currentCheckIn.getTime(), startOfDay.getTime());
        const overlapEnd = Math.min(cap.getTime(), endOfDay.getTime());
        if (overlapEnd > overlapStart) totalPresenceMs += overlapEnd - overlapStart;
      }

      let netWorkMs = totalPresenceMs;
      if (ps.deductBreaks) {
        netWorkMs -= (teaEvent ? ps.teaBreakDurationMs : 0) + (lunchEvent ? ps.lunchBreakDurationMs : 0);
      }

      const dayWork = computeDayWork(events, bs, isToday);

      return {
        employeeCode: w.employeeCode,
        name: w.name,
        department: w.department,
        checkIn: checkInEvent ? fmtTime(checkInEvent.timestamp) : '-',
        teaBreak: teaEvent ? `${fmtTime(teaEvent.timestamp)} (${durationStr(ps.teaBreakDurationMs)})` : '-',
        lunchBreak: lunchEvent ? `${fmtTime(lunchEvent.timestamp)} (${durationStr(ps.lunchBreakDurationMs)})` : '-',
        checkOut: checkOutEvent ? fmtTime(checkOutEvent.timestamp) : '-',
        totalPresence: totalPresenceMs > 0 ? durationStr(totalPresenceMs) : '0h 0m',
        netWork: netWorkMs > 0 ? durationStr(netWorkMs) : '0h 0m',
        status: dayWork.status,
        isActive: w.isActive,
      };
    });

    const summary = buildDaySummaryForWorkers(workers, bs, isToday);

    res.json({ date: workDateStr, summary, records });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate daily report' });
  }
});

// GET /api/report/month-summary?month=YYYY-MM
router.get('/month-summary', async (req: Request, res: Response) => {
  try {
    const monthStr = req.query.month as string;
    const [y, m] = monthStr
      ? monthStr.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1];

    const daysInMonth = new Date(y, m, 0).getDate();
    const todayWorkDate = await getTodayWorkDate();
    const ps = await getPayrollSettings();
    const bs = breakSettings(ps);

    const workers = await prisma.worker.findMany({
      where: { isActive: true },
      include: {
        attendanceEvents: {
          where: {
            workDate: {
              gte: `${y}-${String(m).padStart(2, '0')}-01`,
              lte: `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
            },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    const days: Array<{
      date: string;
      total: number;
      present: number;
      complete: number;
      incomplete: number;
      absent: number;
      attendancePct: number;
    }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayWorkers = workers.map((w) => ({
        attendanceEvents: w.attendanceEvents.filter((e) => e.workDate === date),
      }));
      const summary = buildDaySummaryForWorkers(dayWorkers, bs, date === todayWorkDate);
      days.push({ date, ...summary });
    }

    res.json({ month: `${y}-${String(m).padStart(2, '0')}`, days });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate month summary' });
  }
});

// GET /api/report/salary?month=YYYY-MM
router.get('/salary', async (req: Request, res: Response) => {
  try {
    const monthStr = (req.query.month as string) || undefined;
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      const settingRow = await prisma.systemSetting.findUnique({
        where: { key: 'perm_supervisor_salary_view' },
      });
      if (settingRow?.value === 'false') {
        return res.status(403).json({ error: 'Not authorized to view salary data' });
      }
    }

    const todayWorkDate = await getTodayWorkDate();
    const bounds = resolvePeriodBounds({
      month: monthStr,
      period: monthStr,
      payrollPeriod: 'monthly',
      todayWorkDate,
    });

    const report = await buildSalaryPeriodReport({
      from: bounds.from,
      to: bounds.to,
      periodLabel: bounds.label,
    });

    const finalized = await prisma.payrollExport.findFirst({
      where: {
        period: bounds.label,
        finalizedAt: { not: null },
        status: 'finalized',
      },
      orderBy: { generatedAt: 'desc' },
    });

    res.json({
      month: bounds.label,
      from: report.from,
      to: report.to,
      currency: report.currency,
      totalPayout: report.totalPayout,
      totalTax: report.totalTax,
      totalNet: report.totalNet,
      incompleteDayCount: report.incompleteDayCount,
      finalized: !!finalized,
      finalizedAt: finalized?.finalizedAt ?? null,
      finalizedExportId: finalized?.id ?? null,
      records: report.records,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate salary report' });
  }
});

// POST /api/report/salary/override
router.post('/salary/override', async (req: Request, res: Response) => {
  const { employeeCode, date, hours, regularHours, overtimeHours, reason } = req.body;
  if (!employeeCode || !date) {
    return res.status(400).json({ error: 'Missing employeeCode or date' });
  }

  const hasSplit = regularHours !== undefined && overtimeHours !== undefined;
  const hasTotal = hours !== undefined;
  if (!hasSplit && !hasTotal) {
    return res.status(400).json({ error: 'Provide regularHours+overtimeHours or hours' });
  }

  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can manually override salary or hours.' });
    }

    await assertWorkDateEditable(String(date));

    const worker = await prisma.worker.findUnique({ where: { employeeCode } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const reg = hasSplit ? parseFloat(regularHours) : undefined;
    const ot = hasSplit ? parseFloat(overtimeHours) : undefined;
    const totalHours = hasSplit ? (reg! + ot!) : parseFloat(hours);

    const override = await prisma.dailyOverride.upsert({
      where: { workerId_date: { workerId: worker.id, date } },
      update: {
        hours: totalHours,
        regularHours: reg ?? null,
        overtimeHours: ot ?? null,
        reason,
      },
      create: {
        workerId: worker.id,
        date,
        hours: totalHours,
        regularHours: reg ?? null,
        overtimeHours: ot ?? null,
        reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'Salary Override',
        target: `${worker.name} (${worker.employeeCode})`,
        details: hasSplit
          ? `Manual override for ${date}: regular ${reg}h + OT ${ot}h. Reason: ${reason || 'N/A'}`
          : `Manual override for ${date}: ${hours} hrs. Reason: ${reason || 'N/A'}`,
        ipAddress: getIp(req),
      },
    });

    res.json(override);
  } catch (err: any) {
    if (err?.status === 409 || err?.code === 'PAYROLL_FINALIZED') {
      return res.status(409).json({ error: err.message, code: 'PAYROLL_FINALIZED' });
    }
    res.status(500).json({ error: 'Failed to save override' });
  }
});

// DELETE /api/report/salary/override — clear a day override
router.delete('/salary/override', async (req: Request, res: Response) => {
  const { employeeCode, date } = req.body || {};
  if (!employeeCode || !date) {
    return res.status(400).json({ error: 'Missing employeeCode or date' });
  }

  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can clear salary overrides.' });
    }

    await assertWorkDateEditable(String(date));

    const worker = await prisma.worker.findUnique({ where: { employeeCode } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    await prisma.dailyOverride.deleteMany({
      where: { workerId: worker.id, date: String(date) },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Admin',
        action: 'Salary Override Cleared',
        target: `${worker.name} (${worker.employeeCode})`,
        details: `Cleared override for ${date}`,
        ipAddress: getIp(req),
      },
    });

    res.json({ message: 'Override cleared' });
  } catch (err: any) {
    if (err?.status === 409 || err?.code === 'PAYROLL_FINALIZED') {
      return res.status(409).json({ error: err.message, code: 'PAYROLL_FINALIZED' });
    }
    res.status(500).json({ error: 'Failed to clear override' });
  }
});

export default router;
