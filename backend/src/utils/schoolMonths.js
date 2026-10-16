// The school's month is four school weeks in a row, not a calendar month.
// The year's weeks are numbered from FIRST_WEEK_START (الأسبوع الأول) and
// the opening week carries no marks, so الشهر الأول is weeks 2–5
// (20/9 – 15/10/2026), الشهر الثاني weeks 6–9, and so on, four months a
// term. The second term counts its months afresh from its own first week,
// so the mid-year exams and holiday never fall inside a month.
//
// FIRST_WEEK_START and FIRST_MARKED_WEEK are the app's too
// (edulink-mobile src/utils/schoolWeeks.js): change both each September.
// TERM_2_FIRST_WEEK is the Sunday the second term's marking starts; confirm
// it with the schools each January.
const FIRST_WEEK_START = "2026-09-13";
const FIRST_MARKED_WEEK = 2;
const TERM_2_FIRST_WEEK = "2027-02-07";

const WEEKS_PER_MONTH = 4;
const MONTHS_PER_TERM = 4;
const MONTH_COUNT = MONTHS_PER_TERM * 2;

const DAY = 24 * 60 * 60 * 1000;
const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (date, days) => new Date(date.getTime() + days * DAY);

const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن"];

const termOfMonth = (n) => (n <= MONTHS_PER_TERM ? 1 : 2);

// The Sunday each term's marking starts on.
const termFirstWeek = (term) =>
  term === 1 ? addDays(utc(FIRST_WEEK_START), 7 * (FIRST_MARKED_WEEK - 1)) : utc(TERM_2_FIRST_WEEK);

// Month n (1–8): its four weeks as their Sundays at UTC midnight, the date
// every mark files its week under, and the school days it covers, the
// first Sunday to the last Thursday.
const schoolMonth = (n) => {
  if (!Number.isInteger(n) || n < 1 || n > MONTH_COUNT) return null;
  const term = termOfMonth(n);
  const first = addDays(termFirstWeek(term), 7 * WEEKS_PER_MONTH * ((n - 1) % MONTHS_PER_TERM));
  const weekStarts = Array.from({ length: WEEKS_PER_MONTH }, (_, i) => addDays(first, 7 * i));
  return {
    month: n,
    term,
    label: `الشهر ${ORDINALS[n - 1]}`,
    weekStarts,
    from: first,
    to: addDays(weekStarts[WEEKS_PER_MONTH - 1], 4),
  };
};

const monthsOfTerm = (term) =>
  Array.from({ length: MONTHS_PER_TERM }, (_, i) => schoolMonth((term === 2 ? MONTHS_PER_TERM : 0) + i + 1));

// The whole term, for what is counted by day rather than by week (days
// absent, homework set): from the Saturday the term's first week opens on
// to the Friday before the second term, which runs to the end of August.
const termSpan = (term) => {
  const secondStarts = addDays(utc(TERM_2_FIRST_WEEK), -1);
  if (term === 2) {
    return { start: secondStarts, end: new Date(Date.UTC(secondStarts.getUTCFullYear(), 8, 1) - 1) };
  }
  return { start: addDays(utc(FIRST_WEEK_START), -1), end: new Date(secondStarts.getTime() - 1) };
};

const termOfDate = (date) => (new Date(date) >= termSpan(2).start ? 2 : 1);

// The Sunday of the Saturday–Friday week a day falls in, as
// weekScores.toWeekStart has it.
const weekStartOf = (date) => {
  const d = new Date(date);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return addDays(day, 1 - ((day.getUTCDay() + 1) % 7));
};

// Every month whose first week has begun by `today`, oldest first; the
// first month alone before marking starts.
const monthsBegun = (today = new Date()) => {
  const thisWeek = weekStartOf(today);
  const months = [];
  for (let n = 1; n <= MONTH_COUNT; n += 1) {
    const month = schoolMonth(n);
    if (month.from <= thisWeek) months.push(month);
  }
  return months.length ? months : [schoolMonth(1)];
};

// For an app that still offers calendar months: the school month that
// starts in that calendar month, or null.
const schoolMonthStartingIn = (month, year) => {
  for (let n = 1; n <= MONTH_COUNT; n += 1) {
    const { from } = schoolMonth(n);
    if (from.getUTCMonth() + 1 === month && from.getUTCFullYear() === year) return schoolMonth(n);
  }
  return null;
};

module.exports = {
  schoolMonth,
  monthsOfTerm,
  termSpan,
  termOfDate,
  monthsBegun,
  schoolMonthStartingIn,
};
