const TermTest = require("../models/TermTest");
const Attendance = require("../models/Attendance");
const { computeMonthScores } = require("./weekScores");
const { monthsOfTerm, termSpan } = require("./schoolMonths");
const { isDailyMode } = require("./dailyAttendance");
const { averageToHalf } = require("./halfMarks");

// The weekly40 scheme's month and term arithmetic (utils/gradebook.js),
// exactly as the paper register does it:
//   a month   = the average of its weeks' totals (each out of 40), a month
//               being four school weeks (utils/schoolMonths.js)
//   the term  = the average of its months (out of 40)
//             + الاختبار الأول (15) + الاختبار الثاني (15)
//             = أعمال السنة, out of 70
// plus the number of days the student was absent from the subject's
// lessons over the term. Shared by the printed register and anything that
// shows the same numbers on screen.

const round1 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10;

// A month's average and the term's, as a whole mark or a half.
const average = averageToHalf;

const sum = (values) => {
  const nums = values.filter((v) => v !== null && v !== undefined);
  return nums.length ? round1(nums.reduce((a, b) => a + b, 0)) : null;
};

exports.computeTerm40 = async ({ classroom, subjectId, students, term }) => {
  const studentIds = students.map((s) => s._id);
  const months = monthsOfTerm(term);

  // Each month's average per student, over the weeks recorded in it.
  const monthAverages = {};
  for (const month of months) {
    // eslint-disable-next-line no-await-in-loop -- four months of four weeks.
    const weeklyScores = (
      await computeMonthScores(classroom._id, subjectId, studentIds, month, "weekly40")
    ).filter(({ scores }) => scores);
    studentIds.forEach((id) => {
      const key = id.toString();
      if (!monthAverages[key]) monthAverages[key] = {};
      monthAverages[key][month.month] = weeklyScores.length
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
  const { start: termStart, end: termEnd } = termSpan(term);
  // On the daily register (one register a day, in the first period) an
  // absence belongs to the day, not to a subject — every subject's sheet
  // counts the days the student was away from school.
  const daily = await isDailyMode(classroom.school);
  const absences = await Attendance.find({
    student: { $in: studentIds },
    ...(daily ? {} : { subject: subjectId }),
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
