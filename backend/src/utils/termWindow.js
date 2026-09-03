// Shared "which term are we in, and what date range does it cover" logic —
// used by every screen that rolls up a whole term's coursework (attendance,
// homework, monthly tests, weekly evaluation) into one score. Term 1 runs
// September through January, Term 2 runs February through May, matching the
// school's real academic calendar (same convention the monthly-grades
// feature uses for its own month list).
const TERM_MONTHS = {
  1: [9, 10, 11, 12, 1],
  2: [2, 3, 4, 5],
};

// A classroom's `academicYear` is stored as "2025/2026" — September through
// December falls in the first calendar year, January through May falls in
// the second.
const yearForMonth = (month, academicYear) => {
  const [yearStart, yearEnd] = academicYear.split("/").map(Number);
  return month >= 9 ? yearStart : yearEnd;
};

const currentTermNumber = () => {
  const month = new Date().getMonth() + 1;
  return TERM_MONTHS[1].includes(month) ? 1 : 2;
};

// Returns the current term's month/year pairs plus a [dateStart, dateEnd]
// range spanning the whole term, for the given classroom's academic year.
exports.getCurrentTermWindow = (academicYear) => {
  const term = currentTermNumber();
  const months = TERM_MONTHS[term];

  const monthYearPairs = months.map((month) => ({
    month,
    year: yearForMonth(month, academicYear),
  }));

  const first = monthYearPairs[0];
  const last = monthYearPairs[monthYearPairs.length - 1];

  const dateStart = new Date(Date.UTC(first.year, first.month - 1, 1));
  // Day 0 of the month *after* the last term month = the last day of that
  // last month, in UTC, end-of-day.
  const dateEnd = new Date(
    Date.UTC(last.year, last.month, 0, 23, 59, 59, 999),
  );

  return { term, monthYearPairs, dateStart, dateEnd };
};
