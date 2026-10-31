const MarkingSkip = require("../models/MarkingSkip");
const { SCHEMES, DEFAULT_SCHEME } = require("./gradebook");
const { hasWeeklyEval } = require("./schoolMonths");

// The columns of a week's register that a class's subject has no mark in
// that week (Mohamed, 2026-10-31: «لما يترفع حاجة من الرصد تبقى الحسبة
// بتاعة الأسبوع على المتبقي من الرصد فقط»). Two sources:
//   - the weeks with no تقييم أسبوعي in any school (utils/schoolMonths.js);
//   - what a school's admin took off for one class and subject
//     (models/MarkingSkip.js, «رفع بند من الرصد»).
// Such a column is empty whatever was filed under it, can't be recorded,
// and the week is out of the columns left (weekScores.computeWeekScores);
// a month stands it at the average of the month's other weeks
// (weekScores.monthAverage).

const LABELS = {
  attendanceScore: "مواظبة وسلوك",
  homeworkScore: "الواجب",
  weeklyEvalScore: "التقييم الأسبوعي",
  classworkScore: "كراسة الحصة",
};

// The register's order, per scheme (utils/gradeRegisterExcel.js).
const ORDER = {
  classic: ["attendanceScore", "weeklyEvalScore", "homeworkScore", "classworkScore"],
  weekly40: ["homeworkScore", "weeklyEvalScore", "attendanceScore"],
};

const rulesOf = (scheme) => SCHEMES[scheme] || SCHEMES[DEFAULT_SCHEME];

// The columns a scheme's week has, each with its label and maximum.
const columnsOf = (scheme) => {
  const { max } = rulesOf(scheme);
  return (ORDER[scheme] || ORDER.classic)
    .filter((key) => max[key] !== undefined)
    .map((key) => ({ key, label: LABELS[key], max: max[key] }));
};

// A week by its Sunday, as every mark files it (weekScores.toWeekStart) —
// so a report's Saturday-keyed week finds it too. Its time is the key.
const DAY = 24 * 60 * 60 * 1000;
const sundayOf = (date) => {
  const d = new Date(date);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(day - (((d.getUTCDay() + 1) % 7) - 1) * DAY);
};
const timeOf = (date) => sundayOf(date).getTime();

// Taken off in every school that week.
const everySchoolSkips = (weekStart) => (hasWeeklyEval(weekStart) ? [] : ["weeklyEvalScore"]);
const isEverySchoolSkip = (key, weekStart) => key === "weeklyEvalScore" && !hasWeeklyEval(weekStart);

// One class and subject, several weeks: week (as its time) → Set of columns.
const skipsByWeek = async (classroomId, subjectId, weekStarts) => {
  const out = new Map(weekStarts.map((w) => [timeOf(w), new Set(everySchoolSkips(w))]));
  if (!classroomId || !subjectId || weekStarts.length === 0) return out;
  const docs = await MarkingSkip.find({
    classroom: classroomId,
    subject: subjectId,
    weekStart: { $in: weekStarts.map(sundayOf) },
  })
    .select("weekStart columns")
    .lean();
  for (const doc of docs) {
    const set = out.get(timeOf(doc.weekStart)) || new Set(everySchoolSkips(doc.weekStart));
    doc.columns.forEach((c) => set.add(c));
    out.set(timeOf(doc.weekStart), set);
  }
  return out;
};

const skippedIn = async (classroomId, subjectId, weekStart) =>
  (await skipsByWeek(classroomId, subjectId, [weekStart])).get(timeOf(weekStart));

// Every class and subject of a set of classes over a window, for a report:
// `${classroom}:${subject}` → week time → Set — the admin's only; add
// everySchoolSkips for the rest (skipsAt).
const skipsInWindow = async (classIds, start, end) => {
  const docs = classIds.length
    ? await MarkingSkip.find({ classroom: { $in: classIds }, weekStart: { $gte: start, $lte: end } })
        .select("classroom subject weekStart columns")
        .lean()
    : [];
  const out = new Map();
  for (const doc of docs) {
    const pair = `${doc.classroom}:${doc.subject}`;
    if (!out.has(pair)) out.set(pair, new Map());
    out.get(pair).set(timeOf(doc.weekStart), new Set(doc.columns));
  }
  return out;
};

const skipsAt = (window, classroomId, subjectId, weekStart) =>
  new Set([
    ...everySchoolSkips(weekStart),
    ...(window.get(`${classroomId}:${subjectId}`)?.get(timeOf(weekStart)) || []),
  ]);

// The scheme's columns among those taken off, in the register's order.
const skippedColumns = (scheme, skipped) => columnsOf(scheme).filter((c) => skipped.has(c.key));

// What a week is out of once its columns taken off are gone: 40 → 20.
const outOf = (scheme, skipped) =>
  rulesOf(scheme).weekTotal - skippedColumns(scheme, skipped).reduce((sum, c) => sum + c.max, 0);

// Why a column can't be recorded this week, as the teacher reads it.
const closedMessage = (key, weekStart) =>
  isEverySchoolSkip(key, weekStart)
    ? "الأسبوع ده مالوش تقييم أسبوعي في كل المدارس، فمش محتاج يترصد."
    : `«${LABELS[key]}» اترفع من رصد الأسبوع ده للفصل ده بقرار الإدارة، فمش محتاج يترصد. الأسبوع بيتحسب على باقي البنود.`;

// For a screen: each column taken off → why.
const closedFor = (scheme, skipped, weekStart) =>
  Object.fromEntries(skippedColumns(scheme, skipped).map((c) => [c.key, closedMessage(c.key, weekStart)]));

module.exports = {
  LABELS,
  sundayOf,
  weekTime: timeOf,
  columnsOf,
  everySchoolSkips,
  isEverySchoolSkip,
  skipsByWeek,
  skippedIn,
  skipsInWindow,
  skipsAt,
  skippedColumns,
  outOf,
  closedMessage,
  closedFor,
};
