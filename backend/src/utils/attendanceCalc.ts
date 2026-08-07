export type DayAttendanceStatus = 'complete' | 'incomplete' | 'absent';

export type DayWorkResult = {
  workedHours: number;
  status: DayAttendanceStatus;
  hasCheckIn: boolean;
};

type BreakSettings = {
  deductBreaks: boolean;
  teaBreakDurationMs: number;
  lunchBreakDurationMs: number;
};

/** Compute net worked hours and attendance status for a single work day. */
export function computeDayWork(
  dayEvents: Array<{ eventType: string; timestamp: Date }>,
  settings: BreakSettings,
  capAtNow = false,
): DayWorkResult {
  if (dayEvents.length === 0) {
    return { workedHours: 0, status: 'absent', hasCheckIn: false };
  }

  const checkInEvent = dayEvents.find((e) => e.eventType === 'checked-in');
  if (!checkInEvent) {
    return { workedHours: 0, status: 'absent', hasCheckIn: false };
  }
  const checkOutEvent = [...dayEvents].reverse().find((e) => e.eventType === 'checked-out');
  const status: DayAttendanceStatus = checkOutEvent ? 'complete' : 'incomplete';

  let dayWorkMs = 0;
  let currentCheckIn: { timestamp: Date } | null = null;
  let breaksInShift = { tea: false, lunch: false };

  for (const e of dayEvents) {
    if (e.eventType === 'checked-in') {
      if (!currentCheckIn) currentCheckIn = e;
    } else if (e.eventType === 'checked-out' && currentCheckIn) {
      let duration = new Date(e.timestamp).getTime() - new Date(currentCheckIn.timestamp).getTime();
      if (settings.deductBreaks) {
        if (breaksInShift.tea) duration -= settings.teaBreakDurationMs;
        if (breaksInShift.lunch) duration -= settings.lunchBreakDurationMs;
      }
      if (duration > 0) dayWorkMs += duration;
      currentCheckIn = null;
      breaksInShift = { tea: false, lunch: false };
    } else if (e.eventType === 'tea-break') {
      breaksInShift.tea = true;
    } else if (e.eventType === 'lunch-break') {
      breaksInShift.lunch = true;
    }
  }

  if (currentCheckIn && capAtNow) {
    let duration = Date.now() - new Date(currentCheckIn.timestamp).getTime();
    if (settings.deductBreaks) {
      if (breaksInShift.tea) duration -= settings.teaBreakDurationMs;
      if (breaksInShift.lunch) duration -= settings.lunchBreakDurationMs;
    }
    if (duration > 0) dayWorkMs += duration;
  }

  return {
    workedHours: parseFloat((dayWorkMs / 3600000).toFixed(2)),
    status,
    hasCheckIn: !!checkInEvent,
  };
}

/** Split total worked hours into regular (shift) and overtime buckets. */
export function splitRegularAndOvertime(
  workedHours: number,
  standardWorkHours: number,
  overtimeThreshold: number,
): { regularHours: number; overtimeHours: number } {
  if (workedHours <= 0) return { regularHours: 0, overtimeHours: 0 };
  const regularCap = Math.min(standardWorkHours, overtimeThreshold);
  if (workedHours <= regularCap) {
    return { regularHours: parseFloat(workedHours.toFixed(2)), overtimeHours: 0 };
  }
  if (workedHours <= overtimeThreshold) {
    return { regularHours: parseFloat(workedHours.toFixed(2)), overtimeHours: 0 };
  }
  return {
    regularHours: parseFloat(overtimeThreshold.toFixed(2)),
    overtimeHours: parseFloat((workedHours - overtimeThreshold).toFixed(2)),
  };
}
