// How an average of recorded marks is given (Mohamed, 2026-10-20): as a
// whole mark or a half, never 9.3. It is read the way a teacher reads it —
// to one decimal first — and then .1 and .2 drop to the whole mark, .3 to .6
// become a half, and .7 to .9 go up to the next whole mark:
//   9.2 → 9    9.3 → 9.5    9.6 → 9.5    9.7 → 10
// Used for every average of marks — a column over a month's weeks, a month
// of weekly totals, a term of months — out of 5, 10, 40 alike. Marks a
// teacher enters are kept as entered; only averages are rounded.
const toHalf = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const tenths = Math.round(n * 10);
  const whole = Math.floor(tenths / 10);
  const rest = tenths - whole * 10;
  if (rest <= 2) return whole;
  if (rest <= 6) return whole + 0.5;
  return whole + 1;
};

// The average of the values given, those still missing left out, as a whole
// mark or a half; null when there is none.
const averageToHalf = (values) => {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return nums.length ? toHalf(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
};

module.exports = { toHalf, averageToHalf };
