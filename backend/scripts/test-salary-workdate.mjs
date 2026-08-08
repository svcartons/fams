/**
 * Quick regression: night-shift workDate grouping for salary.
 * Run: node backend/scripts/test-salary-workdate.mjs
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
const SHIFT_CUTOFF_HOUR = 6;

function computeWorkDate(date, midnightAlgo) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  if (!midnightAlgo && ist.getUTCHours() < SHIFT_CUTOFF_HOUR) {
    ist.setUTCDate(ist.getUTCDate() - 1);
  }
  return ist.toISOString().split('T')[0];
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// midnightAlgo=false → 6 AM IST cutoff
const evening = new Date('2026-08-07T16:30:00.000Z'); // 22:00 IST
const earlyMorning = new Date('2026-08-07T23:30:00.000Z'); // 05:00 IST next calendar day

const eveningWd = computeWorkDate(evening, false);
const morningWd = computeWorkDate(earlyMorning, false);

assert(eveningWd === '2026-08-07', `expected evening workDate 2026-08-07 got ${eveningWd}`);
assert(morningWd === '2026-08-07', `expected early morning still 2026-08-07 got ${morningWd}`);

const midnightAlgoEvening = computeWorkDate(evening, true);
const midnightAlgoMorning = computeWorkDate(earlyMorning, true);
assert(midnightAlgoEvening === '2026-08-07', 'midnight algo evening');
assert(midnightAlgoMorning === '2026-08-08', `midnight algo morning should be 08 got ${midnightAlgoMorning}`);

console.log('OK salary workDate regression (computeWorkDate night-shift)');
