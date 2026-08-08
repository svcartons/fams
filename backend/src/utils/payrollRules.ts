import { settingBool, settingNum } from './settingsDefaults';

export type PayrollSettings = {
  standardWorkHours: number;
  overtimeThreshold: number;
  deductBreaks: boolean;
  teaBreakDurationMs: number;
  lunchBreakDurationMs: number;
  payrollDeductBreaks: boolean;
  payrollIncludeOvertime: boolean;
  payrollTaxRate: number;
  payrollRounding: string;
  weekendMultiplier: number;
  holidayMultiplier: number;
  nightDiffRate: number;
  nightDiffStart: string;
  weekendOT: boolean;
  holidayPay: boolean;
  nightDiff: boolean;
  holidays: string[];
};

export function parseHolidayCalendar(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function buildPayrollSettings(settings: Record<string, string>): PayrollSettings {
  return {
    standardWorkHours: settingNum(settings, 'standardWorkHours', 8),
    overtimeThreshold: settingNum(settings, 'overtimeThreshold', 9),
    deductBreaks: settingBool(settings, 'deductBreaks', true),
    teaBreakDurationMs: settingNum(settings, 'teaBreakDuration', 15) * 60000,
    lunchBreakDurationMs: settingNum(settings, 'lunchBreakDuration', 30) * 60000,
    payrollDeductBreaks: settingBool(settings, 'payroll_deduct_breaks', true),
    payrollIncludeOvertime: settingBool(settings, 'payroll_include_overtime', true),
    payrollTaxRate: settingNum(settings, 'payroll_tax_rate', 22),
    payrollRounding: settings.payroll_rounding || 'nearest_15',
    weekendMultiplier: settingNum(settings, 'weekendMultiplier', 1.5),
    holidayMultiplier: settingNum(settings, 'holidayMultiplier', 2),
    nightDiffRate: settingNum(settings, 'nightDiffRate', 1.25),
    nightDiffStart: settings.nightDiffStart || '22:00',
    weekendOT: settingBool(settings, 'weekendOT', true),
    holidayPay: settingBool(settings, 'holidayPay', true),
    nightDiff: settingBool(settings, 'nightDiff', false),
    holidays: parseHolidayCalendar(settings.holiday_calendar),
  };
}

/** Round worked hours per payroll_rounding setting. */
export function roundHours(hours: number, rule: string): number {
  const mins = hours * 60;
  switch (rule) {
    case 'exact':
      return hours;
    case 'nearest_5':
      return Math.round(mins / 5) * 5 / 60;
    case 'nearest_15':
      return Math.round(mins / 15) * 15 / 60;
    case 'nearest_30':
      return Math.round(mins / 30) * 30 / 60;
    default:
      return hours;
  }
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}

function wageMultiplierForDate(dateStr: string, ps: PayrollSettings): number {
  let mult = 1;
  if (ps.holidayPay && ps.holidays.includes(dateStr)) {
    mult = Math.max(mult, ps.holidayMultiplier);
  }
  if (ps.weekendOT && isWeekend(dateStr)) {
    mult = Math.max(mult, ps.weekendMultiplier);
  }
  return mult;
}

/** Compute daily pay from explicit regular + OT hour splits. */
export function computeDailyPayFromSplit(
  regularHours: number,
  overtimeHours: number,
  dateStr: string,
  worker: { dailyWage: number; overtimeRate: number },
  ps: PayrollSettings,
): {
  regularHours: number;
  overtimeHours: number;
  basePay: number;
  otPay: number;
  gross: number;
  tax: number;
  net: number;
} {
  const mult = wageMultiplierForDate(dateStr, ps);
  const reg = roundHours(regularHours, ps.payrollRounding);
  const ot = ps.payrollIncludeOvertime ? roundHours(overtimeHours, ps.payrollRounding) : 0;
  const effectiveStandard = Math.min(ps.standardWorkHours, ps.overtimeThreshold);
  // Profile overtimeRate (₹/hr from worker create/edit) is the sole OT pay rate.
  // Weekend/holiday multipliers apply to daily wage only — not to OT.
  const otRate = Number(worker.overtimeRate) || 0;

  let basePay = 0;
  if (reg >= effectiveStandard) {
    basePay = worker.dailyWage * mult;
  } else if (reg > 0) {
    basePay = (reg / effectiveStandard) * worker.dailyWage * mult;
  }

  const otPay = ot > 0 && otRate > 0 ? ot * otRate : 0;
  const gross = basePay + otPay;
  const tax = gross * (ps.payrollTaxRate / 100);

  return {
    regularHours: reg,
    overtimeHours: ot,
    basePay: parseFloat(basePay.toFixed(2)),
    otPay: parseFloat(otPay.toFixed(2)),
    gross: parseFloat(gross.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    net: parseFloat((gross - tax).toFixed(2)),
  };
}

/** Compute daily pay using total worked hours (legacy). */
export function computeDailyPay(
  workedHours: number,
  dateStr: string,
  worker: { dailyWage: number; overtimeRate: number },
  ps: PayrollSettings,
): { basePay: number; otHours: number; otPay: number; gross: number; tax: number; net: number } {
  const hours = roundHours(workedHours, ps.payrollRounding);
  const otStart = ps.overtimeThreshold;
  const effectiveStandard = Math.min(ps.standardWorkHours, otStart);

  let regularHours = hours;
  let overtimeHours = 0;
  if (ps.payrollIncludeOvertime && hours > otStart) {
    regularHours = otStart;
    overtimeHours = hours - otStart;
  } else if (hours > effectiveStandard) {
    regularHours = hours;
    overtimeHours = 0;
  }

  const split = computeDailyPayFromSplit(regularHours, overtimeHours, dateStr, worker, ps);
  return {
    basePay: split.basePay,
    otHours: split.overtimeHours,
    otPay: split.otPay,
    gross: split.gross,
    tax: split.tax,
    net: split.net,
  };
}
