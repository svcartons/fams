import prisma from '../db';
import { getSettingsMap } from './settingsCache';
import { buildPayrollSettings, computeDailyPayFromSplit, type PayrollSettings } from './payrollRules';
import { computeDayWork, splitRegularAndOvertime } from './attendanceCalc';
import { computeWorkDate, getTodayWorkDate, useMidnightRollover } from './workDate';

export type SalaryDayBreakdown = {
  date: string;
  regularHours: number;
  overtimeHours: number;
  hours: number;
  regularPay: number;
  overtimePay: number;
  dayPay: number;
  tax: number;
  net: number;
  status: string;
  isOverridden: boolean;
};

export type SalaryWorkerRecord = {
  employeeCode: string;
  name: string;
  department: string;
  role: string;
  dailyWage: number;
  overtimeRate: number;
  daysPresent: number;
  incompleteDays: number;
  totalRegularHours: number;
  baseSalary: number;
  overtimeHours: number;
  overtimePay: number;
  salary: number;
  tax: number;
  net: number;
  isActive: boolean;
  dailyBreakdown: SalaryDayBreakdown[];
};

export type SalaryPeriodReport = {
  periodLabel: string;
  from: string;
  to: string;
  currency: string;
  totalPayout: number;
  totalTax: number;
  totalNet: number;
  incompleteDayCount: number;
  records: SalaryWorkerRecord[];
};

export type PeriodBounds = { from: string; to: string; label: string };

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Resolve a payroll period into inclusive workDate bounds. */
export function resolvePeriodBounds(opts: {
  period?: string;
  month?: string;
  from?: string;
  to?: string;
  payrollPeriod?: string;
  todayWorkDate: string;
}): PeriodBounds {
  if (opts.from && opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
    return { from: opts.from, to: opts.to, label: `${opts.from} to ${opts.to}` };
  }

  const monthMatch = (opts.month || opts.period || '').match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = Number(monthMatch[1]);
    const m = Number(monthMatch[2]);
    const from = `${y}-${pad2(m)}-01`;
    const to = `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
    return { from, to, label: `${y}-${pad2(m)}` };
  }

  // period like "2026-05-01_to_2026-05-15"
  const rangeMatch = (opts.period || '').match(/^(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) {
    return { from: rangeMatch[1], to: rangeMatch[2], label: `${rangeMatch[1]} to ${rangeMatch[2]}` };
  }

  const cycle = (opts.payrollPeriod || 'monthly').toLowerCase();
  const today = opts.todayWorkDate;
  const [ty, tm] = today.split('-').map(Number);

  if (cycle === 'weekly') {
    const d = new Date(today + 'T12:00:00Z');
    const dow = d.getUTCDay(); // 0 Sun
    const from = addDays(today, -dow);
    const to = addDays(from, 6);
    return { from, to, label: `${from}_to_${to}` };
  }

  if (cycle === 'biweekly') {
    const to = today;
    const from = addDays(today, -13);
    return { from, to, label: `${from}_to_${to}` };
  }

  if (cycle === 'semimonthly') {
    const day = Number(today.slice(8, 10));
    if (day <= 15) {
      const from = `${ty}-${pad2(tm)}-01`;
      const to = `${ty}-${pad2(tm)}-15`;
      return { from, to, label: `${from}_to_${to}` };
    }
    const from = `${ty}-${pad2(tm)}-16`;
    const to = `${ty}-${pad2(tm)}-${pad2(daysInMonth(ty, tm))}`;
    return { from, to, label: `${from}_to_${to}` };
  }

  // monthly default
  const from = `${ty}-${pad2(tm)}-01`;
  const to = `${ty}-${pad2(tm)}-${pad2(daysInMonth(ty, tm))}`;
  return { from, to, label: `${ty}-${pad2(tm)}` };
}

function breakSettings(ps: PayrollSettings) {
  // Operational deductBreaks is the single source of truth (payroll_deduct_breaks aliases it).
  return {
    deductBreaks: ps.deductBreaks,
    teaBreakDurationMs: ps.teaBreakDurationMs,
    lunchBreakDurationMs: ps.lunchBreakDurationMs,
  };
}

function eventWorkDate(
  e: { workDate: string | null; timestamp: Date },
  midnightAlgo: boolean,
): string {
  return e.workDate || computeWorkDate(new Date(e.timestamp), midnightAlgo);
}

/** Build salary report for an inclusive workDate range. */
export async function buildSalaryPeriodReport(opts: {
  from: string;
  to: string;
  periodLabel?: string;
}): Promise<SalaryPeriodReport> {
  const settings = await getSettingsMap();
  const ps = buildPayrollSettings(settings);
  const bs = breakSettings(ps);
  const midnightAlgo = await useMidnightRollover();
  const todayWorkDate = await getTodayWorkDate();
  const currency = settings.payroll_currency || 'INR';

  const workers = await prisma.worker.findMany({
    where: {
      OR: [
        { isActive: true },
        {
          attendanceEvents: {
            some: {
              OR: [
                { workDate: { gte: opts.from, lte: opts.to } },
                {
                  AND: [
                    { workDate: null },
                    { timestamp: { gte: new Date(opts.from + 'T00:00:00.000Z'), lte: new Date(opts.to + 'T23:59:59.999Z') } },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
    include: {
      attendanceEvents: {
        where: {
          OR: [
            { workDate: { gte: opts.from, lte: opts.to } },
            { workDate: null },
          ],
        },
        orderBy: { timestamp: 'asc' },
      },
      dailyOverrides: {
        where: { date: { gte: opts.from, lte: opts.to } },
      },
    },
    orderBy: { employeeCode: 'asc' },
  });

  let incompleteDayCount = 0;

  const records: SalaryWorkerRecord[] = workers
    .map((w) => {
      const overrideMap = new Map(
        w.dailyOverrides.map((o) => [
          o.date,
          {
            regularHours: o.regularHours ?? null,
            overtimeHours: o.overtimeHours ?? null,
            hours: o.hours,
          },
        ]),
      );

      const eventsByDay = new Map<string, typeof w.attendanceEvents>();
      for (const e of w.attendanceEvents) {
        const d = eventWorkDate(e, midnightAlgo);
        if (d < opts.from || d > opts.to) continue;
        if (!eventsByDay.has(d)) eventsByDay.set(d, []);
        eventsByDay.get(d)!.push(e);
      }
      for (const o of w.dailyOverrides) {
        if (!eventsByDay.has(o.date)) eventsByDay.set(o.date, []);
      }

      let totalBaseSalary = 0;
      let totalOvertimePay = 0;
      let totalRegularHours = 0;
      let totalOvertimeHours = 0;
      let totalTax = 0;
      let totalNet = 0;
      let daysPresent = 0;
      let incompleteDays = 0;

      const dailyBreakdown: SalaryDayBreakdown[] = [];

      eventsByDay.forEach((dayEvents, date) => {
        const dayWork = computeDayWork(dayEvents, bs, date === todayWorkDate);
        const override = overrideMap.get(date);

        let regularHours: number;
        let overtimeHours: number;

        if (override) {
          if (override.regularHours != null && override.overtimeHours != null) {
            regularHours = override.regularHours;
            overtimeHours = override.overtimeHours;
          } else {
            const split = splitRegularAndOvertime(
              override.hours,
              ps.standardWorkHours,
              ps.overtimeThreshold,
            );
            regularHours = split.regularHours;
            overtimeHours = split.overtimeHours;
          }
        } else if (dayWork.workedHours > 0) {
          const split = splitRegularAndOvertime(
            dayWork.workedHours,
            ps.standardWorkHours,
            ps.overtimeThreshold,
          );
          regularHours = split.regularHours;
          overtimeHours = split.overtimeHours;
        } else {
          regularHours = 0;
          overtimeHours = 0;
        }

        const pay = computeDailyPayFromSplit(regularHours, overtimeHours, date, w, ps);
        const hours = regularHours + overtimeHours;

        if (dayWork.status === 'incomplete') {
          incompleteDays += 1;
          incompleteDayCount += 1;
        }

        dailyBreakdown.push({
          date,
          regularHours: pay.regularHours,
          overtimeHours: pay.overtimeHours,
          hours: parseFloat(hours.toFixed(2)),
          regularPay: pay.basePay,
          overtimePay: pay.otPay,
          dayPay: pay.gross,
          tax: pay.tax,
          net: pay.net,
          status: dayWork.status,
          isOverridden: !!override,
        });

        if (hours > 0 || dayWork.hasCheckIn) {
          if (hours > 0) daysPresent += 1;
          totalBaseSalary += pay.basePay;
          totalOvertimePay += pay.otPay;
          totalRegularHours += pay.regularHours;
          totalOvertimeHours += pay.overtimeHours;
          totalTax += pay.tax;
          totalNet += pay.net;
        }
      });

      return {
        employeeCode: w.employeeCode,
        name: w.name,
        department: w.department,
        role: w.role,
        dailyWage: w.dailyWage,
        overtimeRate: w.overtimeRate,
        daysPresent,
        incompleteDays,
        totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
        baseSalary: parseFloat(totalBaseSalary.toFixed(2)),
        overtimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
        overtimePay: parseFloat(totalOvertimePay.toFixed(2)),
        salary: parseFloat((totalBaseSalary + totalOvertimePay).toFixed(2)),
        tax: parseFloat(totalTax.toFixed(2)),
        net: parseFloat(totalNet.toFixed(2)),
        isActive: w.isActive,
        dailyBreakdown: dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)),
      };
    })
    .filter((r) => r.isActive || r.salary > 0);

  const totalPayout = records.reduce((sum, r) => sum + r.salary, 0);
  const totalTax = records.reduce((sum, r) => sum + r.tax, 0);
  const totalNet = records.reduce((sum, r) => sum + r.net, 0);

  return {
    periodLabel: opts.periodLabel || `${opts.from} to ${opts.to}`,
    from: opts.from,
    to: opts.to,
    currency,
    totalPayout: parseFloat(totalPayout.toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    totalNet: parseFloat(totalNet.toFixed(2)),
    incompleteDayCount,
    records,
  };
}

/** Find an active finalized payroll export covering a workDate. */
export async function findFinalizedExportCovering(workDate: string) {
  const exports = await prisma.payrollExport.findMany({
    where: {
      finalizedAt: { not: null },
      status: 'finalized',
    },
    orderBy: { generatedAt: 'desc' },
  });

  for (const row of exports) {
    const bounds = parsePeriodLabelBounds(row.period);
    if (bounds && workDate >= bounds.from && workDate <= bounds.to) {
      return row;
    }
  }
  return null;
}

export function parsePeriodLabelBounds(period: string): { from: string; to: string } | null {
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = Number(monthMatch[1]);
    const m = Number(monthMatch[2]);
    return {
      from: `${y}-${pad2(m)}-01`,
      to: `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`,
    };
  }
  const rangeMatch = period.match(/^(\d{4}-\d{2}-\d{2})(?:_to_| to )(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) return { from: rangeMatch[1], to: rangeMatch[2] };
  return null;
}

export async function assertWorkDateEditable(workDate: string): Promise<void> {
  const locked = await findFinalizedExportCovering(workDate);
  if (locked) {
    const err = new Error(
      `Payroll period ${locked.period} is finalized. Unfinalize it before changing wages or overrides.`,
    ) as Error & { status?: number; code?: string };
    err.status = 409;
    err.code = 'PAYROLL_FINALIZED';
    throw err;
  }
}
