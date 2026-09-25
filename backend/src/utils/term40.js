const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const CourseworkOverride = require("../models/CourseworkOverride");
const TermTest = require("../models/TermTest");
const Attendance = require("../models/Attendance");
const { SCHEMES } = require("./gradebook");
const { computeWeekScores } = require("./weekScores");

// The weekly40 scheme's month and term arithmetic (utils/gradebook.js),
// exactly as the paper register does it:
//   a month   = the average of its weeks' totals (each out of 40)
//   the term  = the average of its months (out of 40)
//             + الاختبار الأول (15) + الاختبار الثاني (15)
//             = أعمال السنة, out of 70
// plus the number of days the student was absent from the subject's
// lessons over the term. Shared by the printed register and anything that
// shows the same numbers on screen.

const round1 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10;

const average = (values) => {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
};

const sum = (values) => {
  const nums = values.filter((v) => v !== null && v !== undefined);
  return nums.length ? round1(nums.reduce((a, b) => a + b, 0)) : null;
};

// "2026/2027": September–December fall in the first year, the rest in the
// second.
const yearForMonth = (month, academicYear) => {
  const [first, second] = String(academicYear).split("/").map(Number);
  return month >= 9 ? first : second;
};

const monthRange = (month, year) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
});

// The weeks a month's register lists: every week the teacher recorded
// something for — a تقييم أسبوعي or a مواظبة وسلوك / واجب entry.
const weekStartsInMonth = async (classroomId, subjectId, month, year) => {
  const { start, end } = monthRange(month, year);
  const range = { $gte: start, $lte: end };
  const filter = { classroom: classroomId, subject: subjectId, weekStart: range };

  const [evaluated, adjusted] = await Promise.all([
    WeeklyEvaluation.find(filter).distinct("weekStart"),
    CourseworkOverride.find(filter).distinct("weekStart"),
  ]);

  const byTime = new Map();
  [...evaluated, ...adjusted].forEach((d) => byTime.set(new Date(d).getTime(), new Date(d)));
  return [...byTime.values()].sort((a, b) => a - b);
};

// Every week of a month, scored — what the month sheet prints.
exports.monthWeekScores = async (classroomId, subjectId, studentIds, month, year) => {
  const weekStarts = await weekStartsInMonth(classroomId, subjectId, month, year);
  const weeklyScores = [];
  for (const weekStart of weekStarts) {
    // eslint-disable-next-line no-await-in-loop -- four or five weeks.
    const scores = await computeWeekScores(classroomId, subjectId, studentIds, weekStart, "weekly40");
    weeklyScores.push({ weekStart, scores });
  }
  return { weekStarts, weeklyScores };
};

exports.computeTerm40 = async ({ classroom, subjectId, students, term }) => {
  const rules = SCHEMES.weekly40;
  const studentIds = students.map((s) => s._id);
  const months = rules.termMonths[term].map((month) => ({
    month,
    year: yearForMonth(month, classroom.academicYear),
  }));

  // Each month's average per student.
  const monthAverages = {};
  for (const { month, year } of months) {
    // eslint-disable-next-line no-await-in-loop -- four months, each a few weeks.
    const { weeklyScores } = await exports.monthWeekScores(
      classroom._id,
      subjectId,
      studentIds,
      month,
      year,
    );
    studentIds.forEach((id) => {
      const key = id.toString();
      if (!monthAverages[key]) monthAverages[key] = {};
      monthAverages[key][month] = weeklyScores.length
        ? average(weeklyScores.map(({ scores }) => scores[key]?.total))
        : null;
    });
  }

  const tests = await TermTest.find({
    classroom: classroom._id,
    subject: subjectId,
    academicYear: classroom.academicYear,
    term,
  }).select("student testNo grade");
  const testsOf = {};
  tests.forEach((t) => {
    const key = t.student.toString();
    if (!testsOf[key]) testsOf[key] = {};
    testsOf[key][t.testNo] = t.grade;
  });

  // Days absent: distinct days with an unexcused absence from this
  // subject's lessons during the term. A double lesson on one day is one
  // day, not two.
  const termStart = monthRange(months[0].month, months[0].year).start;
  const last = months[months.length - 1];
  const termEnd = monthRange(last.month, last.year).end;
  const absences = await Attendance.find({
    student: { $in: studentIds },
    subject: subjectId,
    status: "absent",
    excused: { $ne: true },
    date: { $gte: termStart, $lte: termEnd },
    ...Attendance.GRADED_ONLY,
  }).select("student date");
  const absentDays = {};
  absences.forEach((a) => {
    const key = a.student.toString();
    if (!absentDays[key]) absentDays[key] = new Set();
    absentDays[key].add(new Date(a.date).toISOString().slice(0, 10));
  });

  const rows = {};
  studentIds.forEach((id) => {
    const key = id.toString();
    const monthly = monthAverages[key] || {};
    const weeksAverage = average(Object.values(monthly));
    const test1 = testsOf[key]?.[1] ?? null;
    const test2 = testsOf[key]?.[2] ?? null;
    const testsTotal = sum([test1, test2]);
    rows[key] = {
      monthAverages: monthly,
      weeksAverage,
      test1,
      test2,
      testsTotal,
      yearWork: sum([weeksAverage, testsTotal]),
      absentDays: absentDays[key] ? absentDays[key].size : 0,
    };
  });

  return { months, rows };
};
