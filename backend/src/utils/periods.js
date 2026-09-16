// The school day is a fixed grid of numbered periods, not free-form times:
// seven 50-minute periods back to back from 08:00. The one thing that varies
// is the break — its position and length are set per grade (the lower grades
// break at 10:30 for 15 minutes; the upper grades may not break at the same
// point, or at all), and a break pushes every later period back by its length.
//
// Times are derived here, on the server, from the period number and the
// grade — never taken from the client — so "period 4" can't mean two
// different times depending on who typed it. They are still STORED on each
// Schedule as startTime/endTime, because attendance windows, the teacher's
// "current class", and both apps all read those strings directly.
const PERIOD_COUNT = 7;
const DAY_START_MINUTES = 8 * 60;
const PERIOD_MINUTES = 50;

const toHHMM = (totalMinutes) =>
  `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;

const isValidPeriod = (period) => {
  const n = Number(period);
  return Number.isInteger(n) && n >= 1 && n <= PERIOD_COUNT;
};

// `grade` only needs breakAfterPeriod/breakMinutes; a grade with no break
// configured simply runs the seven periods straight through.
const periodTimes = (period, grade) => {
  if (!isValidPeriod(period)) return null;

  const n = Number(period);
  let start = DAY_START_MINUTES + (n - 1) * PERIOD_MINUTES;

  const breakAfter = grade?.breakAfterPeriod;
  const breakMinutes = grade?.breakMinutes || 0;
  if (breakAfter && breakMinutes > 0 && n > breakAfter) {
    start += breakMinutes;
  }

  return { startTime: toHHMM(start), endTime: toHHMM(start + PERIOD_MINUTES) };
};

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

// Strict inequality on purpose: a period ending 08:50 and the next starting
// 08:50 do not overlap, which is exactly what lets a teacher take two
// periods in a row.
const timesOverlap = (a, b) =>
  toMinutes(a.startTime) < toMinutes(b.endTime) &&
  toMinutes(a.endTime) > toMinutes(b.startTime);

module.exports = {
  PERIOD_COUNT,
  PERIOD_MINUTES,
  isValidPeriod,
  periodTimes,
  timesOverlap,
};
