const Student = require("../models/Student");
const Subject = require("../models/Subject");
const School = require("../models/School");
const TermTest = require("../models/TermTest");
const MonthlyGrade = require("../models/MonthlyGrade");
const Attendance = require("../models/Attendance");
const Behavior = require("../models/Behavior");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const { SCHEMES, schemeForClassroom } = require("./gradebook");
const { computeMonthScores, monthAverage } = require("./weekScores");
const { schoolMonth } = require("./schoolMonths");
const { toHalf, averageToHalf } = require("./halfMarks");
const { isAbsent, isWithdrawn } = require("./absentMark");
const { isInTotal } = require("./subjectsInTotal");
const { otherLanguagesFor } = require("./secondLanguage");
const { adviceFor, levelOf } = require("./monthlyReportAdvice");

// «تقريري الشهري» — one student's school month (four school weeks,
// utils/schoolMonths.js), read off the same marks the register prints, with
// what the app's screens don't say: where in each subject the marks went,
// how the month compares with the class's and with the month before, and
// what to do next month (utils/monthlyReportAdvice.js). The PDF is
// utils/monthlyReportPdf.js.

// The two term tests of weekly40 belong to the term's first two months
// (Future's monthly certificate: «شهر أكتوبر» is month 1 with test 1).
const TERM_TEST_OF_MONTH = { 1: 1, 2: 2, 5: 1, 6: 2 };
const COLUMN_LABELS = {
  homeworkScore: "الواجب",
  weeklyEvalScore: "التقييم الأسبوعي",
  attendanceScore: "مواظبة وسلوك",
  classworkScore: "كراسة الحصة",
};

const sum = (values) => values.reduce((a, b) => a + b, 0);
const mean = (values) => (values.length ? sum(values) / values.length : null);

// One pupil's entries for the month's recorded weeks, as monthAverage takes
// them.
const entriesOf = (weeks, key) =>
  weeks.filter((w) => w.scores && w.scores[key]).map((w) => ({ weekStart: w.weekStart, ...w.scores[key] }));

// A column's average over the month: the weeks it is open in, the teacher
// entered it for the class (`entered`, by week) and the pupil isn't «م» — a
// pupil left out where classmates have a mark counted as 0, as the
// register's total counts them. A column nobody has a mark in yet is null,
// not a 0 the student never got.
const columnAverage = (entries, key, entered) => {
  const values = entries
    .filter(
      (e) =>
        entered.has(new Date(e.weekStart).getTime()) &&
        !e.withdrawnWeek &&
        !(e.skipped || []).includes(key) &&
        !(e.withdrawn || {})[key],
    )
    .map((e) => e[key] ?? 0);
  return values.length ? toHalf(mean(values)) : null;
};

// The weeks the class has any mark in a column.
const enteredWeeks = (weeks, key) =>
  new Set(
    weeks
      .filter((w) => w.scores && Object.values(w.scores).some((e) => e[key] !== null && e[key] !== undefined))
      .map((w) => new Date(w.weekStart).getTime()),
  );

const testOf = (tests, key) => {
  const t = tests.find((x) => String(x.student) === key);
  if (!t) return null;
  if (isWithdrawn(t.withdrawn, t.grade)) return { grade: null, withdrawn: true, absent: false };
  return { grade: t.grade, absent: isAbsent(t.absent, t.grade), withdrawn: false };
};

const subjectMonth = async ({ student, classroom, subject, scheme, month, previous, roster }) => {
  const rules = SCHEMES[scheme];
  const key = String(student._id);
  const columns = Object.keys(rules.max).filter((k) => COLUMN_LABELS[k]);

  const [weeks, before] = await Promise.all([
    computeMonthScores(classroom._id, subject._id, roster, month, scheme),
    previous ? computeMonthScores(classroom._id, subject._id, [student._id], previous, scheme) : null,
  ]);

  const mine = entriesOf(weeks, key);
  // A pupil the teacher entered nothing for all month — one who joined the
  // class after it — has no month here rather than a 0.
  const hasMarks = mine.some((e) => columns.some((c) => e[c] !== null && e[c] !== undefined));
  const monthMark = hasMarks ? monthAverage(mine, scheme) : null;
  const classMarks = roster
    .map((id) => monthAverage(entriesOf(weeks, String(id)), scheme))
    .filter((v) => v !== null);

  // The month's test: weekly40's term test of that month, or the classic
  // monthly test of the calendar month the school month starts in.
  let tests = [];
  let testMax = null;
  if (scheme === "weekly40") {
    const testNo = TERM_TEST_OF_MONTH[month.month];
    if (testNo) {
      testMax = rules.termTestMax;
      tests = await TermTest.find({
        classroom: classroom._id,
        subject: subject._id,
        academicYear: classroom.academicYear,
        term: month.term,
        testNo,
      }).select("student grade absent withdrawn");
    }
  } else {
    testMax = 15;
    tests = await MonthlyGrade.find({
      student: { $in: roster },
      subject: subject._id,
      month: month.from.getUTCMonth() + 1,
      year: month.from.getUTCFullYear(),
    }).select("student grade absent withdrawn");
  }
  const test = testMax ? testOf(tests, key) : null;
  const classTests = testMax
    ? roster.map((id) => testOf(tests, String(id))).filter((t) => t && t.grade !== null).map((t) => t.grade)
    : [];

  const recordedWeeks = weeks.filter((w) => w.scores).length;
  const weekRows = weeks.map((w) => {
    const e = w.scores && w.scores[key];
    return {
      weekStart: w.weekStart,
      recorded: Boolean(w.scores),
      total: e && !e.withdrawnWeek ? e.total : null,
      outOf: e ? e.outOf : rules.weekTotal,
      withdrawn: Boolean(e && e.withdrawnWeek),
    };
  });

  // Marks recorded «غ» this month: what they cost is what the pupil earns in
  // that column on the weeks they were there.
  const absences = [];
  columns.forEach((col) => {
    if (!hasMarks) return;
    const missed = mine.filter((e) => (e.absent || {})[col] && !(e.skipped || []).includes(col));
    if (!missed.length) return;
    const open = mine.filter((e) => !(e.withdrawn || {})[col] && !(e.skipped || []).includes(col));
    const present = open.filter((e) => !(e.absent || {})[col]).map((e) => e[col] ?? 0);
    // What the zeros took off the month's column: the pupil's usual mark on
    // those weeks, spread over the weeks the column is averaged over.
    const cost = present.length ? (mean(present) * missed.length) / open.length : null;
    absences.push({ column: col, label: COLUMN_LABELS[col], count: missed.length, cost });
  });
  if (test && test.absent) absences.push({ column: "test", label: "اختبار الشهر", count: 1, cost: null });

  return {
    subjectId: subject._id,
    subject: subject.name,
    weekTotal: rules.weekTotal,
    monthMark,
    previousMark: before ? monthAverage(entriesOf(before, key), scheme) : null,
    withdrawnMonth: monthMark === null && mine.some((e) => e.withdrawnWeek),
    classAverage: averageToHalf(classMarks),
    classTop: classMarks.length ? Math.max(...classMarks) : null,
    classCount: classMarks.length,
    columns: columns.map((col) => ({
      key: col,
      label: COLUMN_LABELS[col],
      max: rules.max[col],
      average: hasMarks ? columnAverage(mine, col, enteredWeeks(weeks, col)) : null,
      full: mine.length > 0 && mine.every((e) => (e.skipped || []).includes(col) || e[col] === rules.max[col]),
    })),
    test: testMax ? { ...(test || { grade: null, absent: false, withdrawn: false }), max: testMax } : null,
    classTestAverage: averageToHalf(classTests),
    weeks: weekRows,
    recordedWeeks,
    absences,
  };
};

// Days with an unexcused absence, as the app's «يومي» counts them.
const absentDaysIn = async (student, from, to) => {
  const records = await Attendance.find({
    student: student._id,
    date: { $gte: from, $lte: to },
    ...Attendance.GRADED_ONLY,
  }).select("status excused date");
  const days = new Set(
    records.filter((r) => r.status === "absent" && !r.excused).map((r) => new Date(r.date).toISOString().slice(0, 10)),
  );
  return days.size;
};

const missingHomeworkIn = async (student, classroom, from, to) => {
  const set = await Homework.find({ classroom: classroom._id, createdAt: { $gte: from, $lte: to } }).select("_id");
  if (!set.length) return 0;
  return HomeworkResult.countDocuments({
    student: student._id,
    homework: { $in: set.map((h) => h._id) },
    status: "missing",
  });
};

// The share of the month's marks a pupil earned over the subjects given:
// each month mark out of a week's total, each test out of its own.
const overallOf = (subjects, markOf, testOf_) => {
  let earned = 0;
  let possible = 0;
  subjects.forEach((s) => {
    const m = markOf(s);
    if (m !== null && m !== undefined) {
      earned += m;
      possible += s.weekTotal;
    }
    const t = testOf_(s);
    if (t !== null && t !== undefined && s.test) {
      earned += t;
      possible += s.test.max;
    }
  });
  return possible ? { earned: toHalf(earned), possible, percent: Math.round((earned / possible) * 100) } : null;
};

// `studentId`, and the school month (1–8). The student's own record only —
// the caller decides whose that is.
const buildMonthlyReport = async ({ studentId, monthNumber, now = new Date() }) => {
  const month = schoolMonth(Number(monthNumber));
  if (!month) throw new Error("شهر غير معروف");
  const previous = month.month > 1 && schoolMonth(month.month - 1).term === month.term ? schoolMonth(month.month - 1) : null;

  const student = await Student.findById(studentId)
    .populate("classroom", "name grade school academicYear")
    .populate("grade", "name stage");
  if (!student || !student.classroom) return null;
  const classroom = student.classroom;
  const scheme = await schemeForClassroom(classroom);
  const school = await School.findById(student.school).select("name");

  const otherLanguages = await otherLanguagesFor(student);
  const taught = await Subject.find({
    school: student.school,
    noMarks: { $ne: true },
    ...Subject.coveringGrade(student.grade?._id || student.grade),
    ...(otherLanguages.length ? { _id: { $nin: otherLanguages } } : {}),
  }).sort({ name: 1 });
  // The subjects in the total, as «أدائي» lists them; a school whose
  // subjects carry other names gets all of them.
  const counted = taught.filter((s) => isInTotal(s.name));
  const subjects = counted.length ? counted : taught;

  const roster = (await Student.find({ classroom: classroom._id, active: true }).select("_id")).map((s) => s._id);
  if (!roster.some((id) => String(id) === String(student._id))) roster.push(student._id);

  const perSubject = (
    await Promise.all(
      subjects.map((subject) => subjectMonth({ student, classroom, subject, scheme, month, previous, roster })),
    )
  ).filter((s) => s.recordedWeeks > 0 || (s.test && (s.test.grade !== null || s.test.withdrawn)));

  const dayAfter = new Date(month.to.getTime() + 24 * 60 * 60 * 1000 - 1);
  const [absentDays, missingHomework, praise] = await Promise.all([
    absentDaysIn(student, month.from, dayAfter),
    missingHomeworkIn(student, classroom, month.from, dayAfter),
    Behavior.countDocuments({ student: student._id, type: "positive", date: { $gte: month.from, $lte: dayAfter } }),
  ]);

  // Where the month's marks went, column by column over every subject: the
  // part of the plan a student can see at once.
  const lostBy = new Map();
  const lose = (key, label, max, got) => {
    const entry = lostBy.get(key) || { key, label, lost: 0, possible: 0 };
    entry.lost += max - got;
    entry.possible += max;
    lostBy.set(key, entry);
  };
  perSubject.forEach((s) => {
    s.columns.forEach((c) => c.average !== null && lose(c.key, c.label, c.max, c.average));
    if (s.test && s.test.grade !== null) lose("test", "اختبار الشهر", s.test.max, s.test.grade);
  });
  const lost = [...lostBy.values()].map((l) => ({ ...l, lost: toHalf(l.lost) }));

  // The month week by week, every subject together: each week's marks out
  // of what that week was out of.
  const weekTrend = month.weekStarts.map((weekStart, i) => {
    let earned = 0;
    let possible = 0;
    perSubject.forEach((s) => {
      const w = s.weeks[i];
      if (s.monthMark === null || !w || w.total === null) return;
      earned += w.total;
      possible += w.outOf;
    });
    return { weekStart, percent: possible ? Math.round((earned / possible) * 100) : null };
  });

  const overall = overallOf(perSubject, (s) => s.monthMark, (s) => s.test?.grade ?? null);
  const previousOverall = previous ? overallOf(perSubject, (s) => s.previousMark, () => null) : null;
  const monthOnly = overallOf(perSubject, (s) => s.monthMark, () => null);
  const classOverall = overallOf(perSubject, (s) => s.classAverage, (s) => (s.test ? s.classTestAverage : null));

  const report = {
    student: {
      id: student._id,
      // A first name is often two («معاذ محمد»); the report calls them by one.
      firstName: String(student.firstName).trim().split(/\s+/)[0],
      name: `${student.firstName} ${student.lastName}`,
      female: student.gender === "female",
      classroom: classroom.name,
      grade: student.grade?.name || "",
      school: school?.name || "",
    },
    month: { number: month.month, label: month.label, from: month.from, to: month.to, term: month.term },
    scheme,
    // Until the month's last day is over, its weeks may still fill in.
    complete: now > dayAfter,
    subjects: perSubject,
    overall: overall ? { ...overall, level: levelOf(overall.percent) } : null,
    // Last month's weeks against this month's, tests left out of both.
    change:
      previousOverall && monthOnly ? { from: previousOverall.percent, to: monthOnly.percent } : null,
    classOverall,
    lost,
    weekTrend,
    absentDays,
    missingHomework,
    praise,
    generatedAt: now,
  };
  report.advice = adviceFor(report);
  return report;
};

module.exports = { buildMonthlyReport };
