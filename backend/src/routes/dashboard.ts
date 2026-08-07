import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getTodayWorkDate, statusFromTodayEvents } from '../utils/workDate';
import { computeDayWork } from '../utils/attendanceCalc';
import { buildPayrollSettings } from '../utils/payrollRules';
import { sendWebhookNotification } from '../utils/notifications';

const router = Router();

// GET /api/dashboard - aggregated KPI data (today's work day only)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const todayWorkDate = await getTodayWorkDate();

    const [workers, recentActivity, pendingCorrections, settingRows, shifts, attendanceEventCount] = await Promise.all([
      prisma.worker.findMany({
        where: { isActive: true },
        include: {
          attendanceEvents: {
            where: { workDate: todayWorkDate },
            orderBy: { timestamp: 'asc' },
          },
        },
      }),
      prisma.attendanceEvent.findMany({
        where: { workDate: todayWorkDate },
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: { worker: true },
      }),
      prisma.manualCorrection.count({
        where: { status: 'pending' },
      }),
      prisma.systemSetting.findMany(),
      prisma.shift.findMany({
        include: {
          workers: {
            where: { isActive: true },
            include: {
              attendanceEvents: {
                where: { workDate: todayWorkDate },
                orderBy: { timestamp: 'asc' },
              },
            },
          },
        },
      }),
      prisma.attendanceEvent.count(),
    ]);

    const total = workers.length;
    const statusMap: Record<string, number> = {
      'checked-in': 0,
      'tea-break': 0,
      'lunch-break': 0,
      'checked-out': 0,
      absent: 0,
    };

    const payrollSettings = buildPayrollSettings(
      Object.fromEntries(settingRows.map((r: any) => [r.key, r.value])),
    );
    const breakSettings = {
      deductBreaks: payrollSettings.deductBreaks,
      teaBreakDurationMs: payrollSettings.teaBreakDurationMs,
      lunchBreakDurationMs: payrollSettings.lunchBreakDurationMs,
    };

    const missedPunchWorkers: Array<{ employeeCode: string; name: string }> = [];

    const settingsMap = Object.fromEntries(settingRows.map((r: any) => [r.key, r.value]));
    const breakAlertMins = Number(settingsMap.breakOvertimeAlert ?? 20);
    const now = new Date();

    const breakWorkers: typeof workers = [];

    for (const w of workers) {
      const status = statusFromTodayEvents(w.attendanceEvents);
      statusMap[status] = (statusMap[status] ?? 0) + 1;

      const dayWork = computeDayWork(w.attendanceEvents, breakSettings, true);
      if (dayWork.status === 'incomplete') {
        missedPunchWorkers.push({ employeeCode: w.employeeCode, name: w.name });
      }

      const latest = w.attendanceEvents[w.attendanceEvents.length - 1];
      if (latest && ['tea-break', 'lunch-break'].includes(latest.eventType)) {
        const diffMs = now.getTime() - new Date(latest.timestamp).getTime();
        if (diffMs > breakAlertMins * 60 * 1000) {
          breakWorkers.push(w);
        }
      }
    }

    const kpi = {
      total,
      present: statusMap['checked-in'],
      absent: statusMap['absent'],
      onBreak: (statusMap['tea-break'] ?? 0) + (statusMap['lunch-break'] ?? 0),
      checkedOut: statusMap['checked-out'],
      missedPunchCount: missedPunchWorkers.length,
      workDate: todayWorkDate,
    };

    const alerts = [];
    if (missedPunchWorkers.length > 0) {
      alerts.push({
        type: 'warning',
        message: `${missedPunchWorkers.length} worker(s) missed punch out today`,
      });
    }
    if (pendingCorrections > 0) {
      alerts.push({ type: 'warning', message: `${pendingCorrections} manual correction(s) pending approval` });
    }
    if (breakWorkers.length > 0) {
      alerts.push({ type: 'warning', message: `${breakWorkers.length} worker(s) on break > ${breakAlertMins} minutes` });
    }

    const capacityPct = Number(settingsMap.shiftCapacityAlertPct ?? 80);
    const capacityAlertsOn = settingsMap.shiftCapacityAlerts === 'true';
    for (const s of shifts) {
      const present = s.workers.filter((w: any) => {
        const st = statusFromTodayEvents(w.attendanceEvents);
        return st === 'checked-in' || st === 'tea-break' || st === 'lunch-break';
      }).length;
      const pct = s.capacity > 0 ? Math.round((present / s.capacity) * 100) : 0;
      if (capacityAlertsOn && pct >= capacityPct) {
        alerts.push({
          type: pct >= 100 ? 'error' : 'warning',
          message: `Shift "${s.name}" at ${pct}% capacity (${present}/${s.capacity})`,
        });
      }
      if (settingsMap.notif_low_capacity === 'true' && pct >= Number(settingsMap.notif_capacity_pct ?? 80)) {
        sendWebhookNotification(
          'notif_low_capacity',
          `📉 **Low Capacity**\nShift \`${s.name}\` is at ${pct}% (${present}/${s.capacity} workers).`,
        ).catch(() => {});
      }
    }
    const STORAGE_ALERT_THRESHOLD = 50000;
    if (attendanceEventCount > STORAGE_ALERT_THRESHOLD) {
      alerts.push({
        type: 'warning',
        message: `Database has ${attendanceEventCount.toLocaleString()} attendance records. Consider archiving old data to free storage.`,
      });
    }

    const shiftData = shifts.map((s: any) => {
      const present = s.workers.filter((w: any) => {
        const st = statusFromTodayEvents(w.attendanceEvents);
        return st === 'checked-in' || st === 'tea-break' || st === 'lunch-break';
      }).length;
      return {
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        present,
        capacity: s.capacity,
      };
    });

    res.json({
      kpi,
      alerts,
      missedPunchWorkers,
      shifts: shiftData,
      recentActivity: recentActivity.map((e: any) => ({
        time: new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        worker: `${e.worker.name}${!e.worker.isActive ? ' (Inactive)' : ''}`,
        action: e.eventType.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        type: e.method,
        avatarPhoto: e.worker.avatarPhoto,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/dashboard/trend - historical attendance rate
router.get('/trend', async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || 'day';
    const workersCount = await prisma.worker.count({ where: { isActive: true } });

    if (range === 'day') {
      const dateRanges = Array.from({ length: 7 }, (_, i) => {
        const startOfDay = new Date();
        startOfDay.setDate(startOfDay.getDate() - (6 - i));
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setHours(23, 59, 59, 999);
        const dateStr = startOfDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const workDate = startOfDay.toISOString().split('T')[0];
        return { startOfDay, endOfDay, dateStr, workDate };
      });

      const counts = await Promise.all(
        dateRanges.map(({ workDate }: any) =>
          prisma.attendanceEvent.groupBy({
            by: ['workerId'],
            where: { eventType: 'checked-in', workDate },
          }),
        ),
      );

      const result = dateRanges.map(({ dateStr }: any, i: number) => {
        const present = counts[i].length;
        return { date: dateStr, present, absent: Math.max(0, workersCount - present) };
      });

      return res.json(result);
    } else if (range === 'month') {
      const monthRanges = Array.from({ length: 12 }, (_, i) => {
        const idx = 11 - i;
        const startOfMonth = new Date();
        startOfMonth.setMonth(startOfMonth.getMonth() - idx);
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        const label = startOfMonth.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const daysInPeriod = idx === 0 ? new Date().getDate() : endOfMonth.getDate();
        return { startOfMonth, endOfMonth, label, daysInPeriod };
      });

      const presences = await Promise.all(
        monthRanges.map(({ startOfMonth, endOfMonth }: any) =>
          prisma.attendanceEvent.groupBy({
            by: ['workerId', 'workDate'],
            where: {
              eventType: 'checked-in',
              timestamp: { gte: startOfMonth, lte: endOfMonth },
              workDate: { not: null },
            },
          }),
        ),
      );

      const result = monthRanges.map(({ label, daysInPeriod }: any, i: number) => {
        const uniqueWorkerDays = presences[i].length;
        const avgPresent = Math.round(uniqueWorkerDays / daysInPeriod);
        return { date: label, present: avgPresent, absent: Math.max(0, workersCount - avgPresent) };
      });

      return res.json(result);
    } else if (range === 'year') {
      const yearRanges = Array.from({ length: 5 }, (_, i) => {
        const idx = 4 - i;
        const startOfYear = new Date();
        startOfYear.setFullYear(startOfYear.getFullYear() - idx);
        startOfYear.setMonth(0);
        startOfYear.setDate(1);
        startOfYear.setHours(0, 0, 0, 0);
        const endOfYear = new Date(startOfYear.getFullYear(), 11, 31);
        endOfYear.setHours(23, 59, 59, 999);
        const label = String(startOfYear.getFullYear());
        const isCurrentYear = idx === 0;
        const totalDays = isCurrentYear
          ? Math.floor((Date.now() - startOfYear.getTime()) / 86400000) + 1
          : 365;
        return { startOfYear, endOfYear, label, totalDays };
      });

      const presences = await Promise.all(
        yearRanges.map(({ startOfYear, endOfYear }: any) =>
          prisma.attendanceEvent.groupBy({
            by: ['workerId', 'workDate'],
            where: {
              eventType: 'checked-in',
              timestamp: { gte: startOfYear, lte: endOfYear },
              workDate: { not: null },
            },
          }),
        ),
      );

      const result = yearRanges.map(({ label, totalDays }: any, i: number) => {
        const uniqueWorkerDays = presences[i].length;
        const avgPresent = Math.round(uniqueWorkerDays / totalDays);
        return { date: label, present: avgPresent, absent: Math.max(0, workersCount - avgPresent) };
      });

      return res.json(result);
    }

    res.json([]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

export default router;
