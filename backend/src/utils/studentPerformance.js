const Subject = require("../models/Subject");
const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const CourseworkOverride = require("../models/CourseworkOverride");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const Attendance = require("../models/Attendance");
const TermTest = require("../models/TermTest");
const MonthlyGrade = require("../models/MonthlyGrade");
const Result = require("../models/Result");
const Behavior = require("../models/Behavior");
const { SCHEMES, schemeForClassroom } = require("./gradebook");
const { computeWeekScores } = require("./weekScores");
const { isDailyMode } = require("./dailyAttendance");

// "أدائي" — one student's standing in each subject over a term, built from
// exactly the numbers their teachers record and the register prints: every
// week's marks, each month's average of its weeks, and (on weekly40) the
// two term tests and أعمال السنة out of 70. Alongside: homework handed in,
// attendance in that subject's lessons, and praise notes.

// The months of each term. weekly40 carries its own (gradebook.js); the
// classic register runs the first term through January, as the monthly
// tests do (monthlyGradeController).
const TERM_MONTHS = {
  weekly40: SCHEMES.weekly40.termMonths,
  classic: { 1: [9, 10, 11, 12, 1], 2: [2, 3, 4, 5] },
};

const round1 = (n) => (n === null || Number.isNaN(n) ? null : Math.round(n * 10) / 10);
const average = (values) => {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
};

const yearForMonth = (month, academicYear) => {
  const [first, second] = String(academicYear || "").split("/").map(Number);
  if (!first) return new Date().getUTCFullYear();
  return month >= 9 ? first : second || first + 1;
};

// The term a date falls in; the summer and January count with the term
// just before them.
const termOf = (scheme, month) => {
  const months = TERM_MONTHS[scheme] || TERM_MONTHS.classic;
  if (months[2].includes(month) || (month >= 6 && month <= 8)) return 2;
  return 1;
};

const subjectPerformance = async ({ student, classroom, subject, scheme, term, daily }) => {
  const rules = SCHEMES[scheme];
  const months = (TERM_MONTHS[scheme] || TERM_MONTHS.classic)[term].map((month) => ({
    month,
    year: yearForMonth(month, classroom.academicYear),
  }));
  const start = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const last = months[months.length - 1];
  const end = new Date(Date.UTC(last.year, last.month, 0, 23, 59, 59, 999));
  const inTerm = { $gte: start, $lte: end };
  const where = { classroom: classroom._id, subject: subject._id };

  // The weeks the teacher recorded something for — the weeks the register
  // lists.
  const [evaluated, adjusted, notebook] = await Promise.all([
    WeeklyEvaluation.find({ ...where, weekStart: inTerm }).distinct("weekStart"),
    CourseworkOverride.find({ ...where, weekStart: inTerm }).distinct("weekStart"),
    rules.classwork ? ClassworkNotebook.find({ ...where, weekStart: inTerm }).distinct("weekStart") : [],
  ]);
  const byTime = new Map();
  [...evaluated, ...adjusted, ...notebook].forEach((d) => byTime.set(new Date(d).getTime(), new Date(d)));
  const weekStarts = [...byTime.values()].sort((a, b) => a - b);

  const key = String(student._id);
  const weeks = await Promise.all(
    weekStarts.map(async (weekStart) => {
      const scores = await computeWeekScores(classroom._id, subject._id, [student._id], weekStart, scheme);
      const mine = scores[key] || {};
      return {
        weekStart,
        homeworkScore: mine.homeworkScore ?? null,
        weeklyEvalScore: mine.weeklyEvalScore ?? null,
        attendanceScore: mine.attendanceScore ?? null,
        classworkScore: rules.classwork ? mine.classworkScore ?? null : undefined,
        total: mine.total ?? null,
      };
    }),
  );

  const monthAverages = months.map(({ month, year }) => ({
    month,
    year,
    average: average(
      weeks
        .filter((w) => w.weekStart.getUTCMonth() + 1 === month && w.weekStart.getUTCFullYear() === year)
        .map((w) => w.total),
    ),
  }));
  const weeksAverage = average(monthAverages.map((m) => m.average));

  const [homework, attendance, praise, tests, monthly, exams] = await Promise.all([
    Homework.find({ ...where, createdAt: inTerm }).select("_id"),
    // A daily register's absences belong to the day, not a subject.
    Attendance.find({
      student: student._id,
      ...(daily ? {} : { subject: subject._id }),
      date: inTerm,
      ...Attendance.GRADED_ONLY,
    }).select("status excused date"),
    Behavior.countDocuments({ student: student._id, subject: subject._id, type: "positive", date: inTerm }),
    scheme === "weekly40"
      ? TermTest.find({ student: student._id, subject: subject._id, academicYear: classroom.academicYear, term })
          .select("testNo grade")
      : [],
    scheme === "weekly40"
      ? []
      : MonthlyGrade.find({
          student: student._id,
          subject: subject._id,
          $or: months.map(({ month, year }) => ({ month, year })),
        }).select("month year grade"),
    Result.find({ student: student._id, subject: subject._id })
      .populate("exam", "title")
      .select("exam grade"),
  ]);

  const results = homework.length
    ? await HomeworkResult.find({ student: student._id, homework: { $in: homework.map((h) => h._id) } })
        .select("status")
    : [];

  const absentDays = new Set(
    attendance
      .filter((a) => a.status === "absent" && !a.excused)
      .map((a) => new Date(a.date).toISOString().slice(0, 10)),
  ).size;

  const out = {
    subjectId: subject._id,
    subject: subject.name,
    weeks,
    monthAverages,
    weeksAverage,
    homework: {
      set: homework.length,
      submitted: results.filter((r) => r.status === "submitted").length,
      missing: results.filter((r) => r.status === "missing").length,
    },
    attendance: {
      present: attendance.filter((a) => a.status === "present").length,
      late: attendance.filter((a) => a.status === "late").length,
      absent: attendance.filter((a) => a.status === "absent").length,
      absentDays,
    },
    praise,
    exams: exams.map((r) => ({ _id: r._id, exam: r.exam?.title || "", grade: r.grade, outOf: 100 })),
  };

  if (scheme === "weekly40") {
    const test = (n) => tests.find((t) => t.testNo === n)?.grade ?? null;
    const test1 = test(1);
    const test2 = test(2);
    const testsTotal = test1 === null && test2 === null ? null : (test1 || 0) + (test2 || 0);
    out.tests = { test1, test2, total: testsTotal };
    out.yearWork =
      weeksAverage === null && testsTotal === null ? null : round1((weeksAverage || 0) + (testsTotal || 0));
  } else {
    out.monthlyTests = monthly
      .map((m) => ({ month: m.month, year: m.year, grade: m.grade, outOf: 15 }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }

  // Who teaches it: the class assignment first, then the timetable.
  const assignment = await ClassAssignment.findOne(where).populate("teacher", "firstName lastName");
  const lesson = assignment ? null : await Schedule.findOne(where).populate("teacher", "firstName lastName");
  const teacher = assignment?.teacher || lesson?.teacher;
  out.teacher = teacher ? `${teacher.firstName} ${teacher.lastName}` : "";

  out.hasData = Boolean(
    weeks.length > 0 ||
    out.homework.set > 0 ||
    attendance.length > 0 ||
    exams.length > 0 ||
    (out.tests && out.tests.total !== null) ||
    (out.monthlyTests && out.monthlyTests.length > 0),
  );

  return out;
};

// Every subject taught to the student's grade, for one term.
const studentPerformance = async ({ student, term, today }) => {
  const classroom = student.classroom;
  const scheme = await schemeForClassroom(classroom);
  const rules = SCHEMES[scheme];
  const daily = await isDailyMode(student.school);
  const chosenTerm = [1, 2].includes(Number(term)) ? Number(term) : termOf(scheme, today.getUTCMonth() + 1);

  const subjects = await Subject.find({
    school: student.school,
    ...Subject.coveringGrade(student.grade?._id || student.grade),
  }).sort({ name: 1 });

  const perSubject = await Promise.all(
    subjects.map((subject) =>
      subjectPerformance({ student, classroom, subject, scheme, term: chosenTerm, daily }),
    ),
  );

  return {
    scheme,
    term: chosenTerm,
    academicYear: classroom.academicYear,
    max: rules.max,
    weekTotal: rules.weekTotal,
    termTestMax: rules.termTestMax || null,
    termTotal: rules.termTotal || null,
    subjects: perSubject,
  };
};

module.exports = { studentPerformance, termOf };
