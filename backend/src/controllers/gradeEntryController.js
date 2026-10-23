const mongoose = require("mongoose");
const Classroom = require("../models/Classroom");
const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const Student = require("../models/Student");
const School = require("../models/School");
const Attendance = require("../models/Attendance");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const MonthlyGrade = require("../models/MonthlyGrade");
const TermTest = require("../models/TermTest");
// Registered for the populates below, not used directly.
require("../models/Subject");
require("../models/User");
require("../models/Grade");
const { scopeFilter } = require("../utils/tenant");
const { SCHEMES, schemeFor } = require("../utils/gradebook");
const { isDailyMode } = require("../utils/dailyAttendance");
const { reportPeriod, weekKey } = require("../utils/reportPeriod");
const { termOfDate } = require("../utils/schoolMonths");
const { electivesByClass } = require("../utils/secondLanguage");

// "رصد الدرجات" — for a week or a month, which teachers have recorded marks
// for their classes and which have not. Read only, over the same documents
// the teacher's app writes; nothing here is entered or changed.
//
// Each class is shown with exactly the columns of its own school's register
// (utils/gradebook.js), in the register's order, each column on its own:
//   classic   مواظبة · واجب · تقييم أسبوعي · كراسة الحصة
//   weekly40  الواجب المنزلي · تقييم أسبوعي · مواظبة وسلوك
// A column counts a student as recorded when the register would print a
// number for them that week.

// The week's homework mark is the teacher's to give every week (they give it
// directly — homework itself is set without marks), whether or not any
// homework was posted in the app that week.
const REGISTER_COLUMNS = {
  classic: [
    // Worked out from the attendance register, or set by the teacher.
    { key: "attendance", label: "مواظبة", maxField: "attendanceScore", entered: false },
    { key: "homework", label: "واجب", maxField: "homeworkScore", entered: true },
    { key: "weekly", label: "تقييم أسبوعي", maxField: "weeklyEvalScore", entered: true },
    { key: "classwork", label: "كراسة الحصة", maxField: "classworkScore", entered: true },
  ],
  weekly40: [
    { key: "homework", label: "الواجب المنزلي", maxField: "homeworkScore", entered: true },
    { key: "weekly", label: "تقييم أسبوعي", maxField: "weeklyEvalScore", entered: true },
    { key: "conduct", label: "مواظبة وسلوك", maxField: "attendanceScore", entered: true },
  ],
};

const pairKey = (classroom, subject) => `${classroom}:${subject}`;

const newBucket = () => ({ students: new Set(), weeks: new Map(), last: null });

const add = (bucket, student, date, updatedAt) => {
  bucket.students.add(String(student));
  const week = weekKey(date).getTime();
  if (!bucket.weeks.has(week)) bucket.weeks.set(week, new Set());
  bucket.weeks.get(week).add(String(student));
  if (updatedAt && (!bucket.last || updatedAt > bucket.last)) bucket.last = updatedAt;
};

// Every entry of one kind in the window, grouped by `keyOf`.
const tally = (docs, keyOf, dateOf = (d) => d.weekStart) => {
  const out = new Map();
  for (const doc of docs) {
    const key = keyOf(doc);
    if (!out.has(key)) out.set(key, newBucket());
    add(out.get(key), doc.student, dateOf(doc), doc.updatedAt);
  }
  return out;
};

// Two sources for one column (a computed number and a teacher's correction).
const merge = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const out = newBucket();
  for (const src of [a, b]) {
    src.students.forEach((s) => out.students.add(s));
    src.weeks.forEach((set, week) => {
      if (!out.weeks.has(week)) out.weeks.set(week, new Set());
      set.forEach((s) => out.weeks.get(week).add(s));
    });
    if (src.last && (!out.last || src.last > out.last)) out.last = src.last;
  }
  return out;
};

// One column for one class, measured against the period.
//   week   — how many of the class's students have a number
//   month  — how many of the month's weeks have one for the whole class
const measure = (bucket, size, weeks, period) => {
  if (!bucket) return { students: 0, weeksDone: 0, weeksPartial: 0, full: false, any: false };
  let weeksDone = 0;
  let weeksPartial = 0;
  for (const week of weeks) {
    const marked = bucket.weeks.get(week.getTime())?.size || 0;
    if (marked >= size) weeksDone += 1;
    else if (marked > 0) weeksPartial += 1;
  }
  const students = period === "week" ? bucket.weeks.get(weeks[0]?.getTime())?.size || 0 : bucket.students.size;
  const full = weeks.length > 0 && weeksDone >= weeks.length;
  return { students, weeksDone, weeksPartial, full, any: weeksDone + weeksPartial > 0 };
};

const rank = { none: 0, partial: 1, complete: 2 };

// The «اختبار الشهر» view (kind "tests"), for a calendar month: on the
// classic register the month's test (MonthlyGrade, filed by calendar
// month), on weekly40 — which has no monthly test — the term's two tests.
// Each counts the students of the class who have the mark.
const testEntry = async ({ classrooms, schemeOf, range, onRoster }) => {
  const month = range.start.getUTCMonth() + 1;
  const year = range.start.getUTCFullYear();
  const term = termOfDate(range.start);
  const idsOf = (scheme) => classrooms.filter((c) => schemeOf(c) === scheme).map((c) => c._id);
  const [monthly, termTests] = await Promise.all([
    MonthlyGrade.find({ classroom: { $in: idsOf("classic") }, month, year })
      .select("classroom subject student updatedAt")
      .lean(),
    TermTest.find({ classroom: { $in: idsOf("weekly40") }, term })
      .select("classroom subject student testNo updatedAt")
      .lean(),
  ]);

  const byPair = (docs) => {
    const out = new Map();
    for (const doc of docs.filter(onRoster)) {
      const key = pairKey(doc.classroom, doc.subject);
      if (!out.has(key)) out.set(key, { students: new Set(), last: null });
      const entry = out.get(key);
      entry.students.add(String(doc.student));
      if (!entry.last || doc.updatedAt > entry.last) entry.last = doc.updatedAt;
    }
    return out;
  };
  const monthlyBy = byPair(monthly);
  const testBy = { 1: byPair(termTests.filter((t) => t.testNo === 1)), 2: byPair(termTests.filter((t) => t.testNo === 2)) };

  const column = (key, label, entry, size) => {
    const students = entry ? entry.students.size : 0;
    return { key, label, max: 15, entered: true, applicable: true, students, full: students >= size, any: students > 0 };
  };

  return {
    month,
    year,
    term,
    columnsFor: (key, scheme, size) => {
      const entries = scheme === "weekly40" ? [testBy[1].get(key), testBy[2].get(key)] : [monthlyBy.get(key)];
      const columns =
        scheme === "weekly40"
          ? [column("test1", "الاختبار الأول", entries[0], size), column("test2", "الاختبار الثاني", entries[1], size)]
          : [column("monthly", "اختبار الشهر", entries[0], size)];
      const lasts = entries.map((e) => e?.last).filter(Boolean);
      return { columns, last: lasts.length ? new Date(Math.max(...lasts.map((d) => new Date(d).getTime()))) : null };
    },
  };
};

// The report for a set of classes — the whole of an admin's school
// (getGradeEntry), or with `teacherId` only that teacher's own classes
// (getMyGradeEntry, the teacher app's «آخر التطورات»). `kind` "tests" is the
// admin's «اختبار الشهر» view instead of the weeks' marks (testEntry).
const buildGradeEntry = async ({ classFilter, range, teacherId = null, kind = "weeks" }) => {
  const classrooms = await Classroom.find(classFilter)
    .select("name grade school")
    .populate("grade", "name stage")
    .lean();
  const classIds = classrooms.map((c) => c._id);
  const classById = new Map(classrooms.map((c) => [String(c._id), c]));

  const schoolIds = [...new Set(classrooms.map((c) => String(c.school)))];
  const schools = await School.find({ _id: { $in: schoolIds } }).select("gradebook conductEnteredFrom").lean();
  const schoolById = new Map(schools.map((s) => [String(s._id), s]));
  const dailyBySchool = new Map(
    await Promise.all(schoolIds.map(async (id) => [id, await isDailyMode(id)])),
  );
  const schemeOf = (classroom) => schemeFor(schoolById.get(String(classroom.school)), classroom.grade?.stage);

  // Who teaches what: the school's assignments first, then the timetable.
  // A period with no teacher (طابور, نشاط) owes no marks and is left out,
  // and so is a subject that is taught but not marked (Subject.noMarks).
  const [assigned, timetabled] = await Promise.all([
    ClassAssignment.find({ classroom: { $in: classIds } })
      .select("teacher classroom subject")
      .populate("teacher", "firstName lastName")
      .populate("subject", "name noMarks")
      .lean(),
    Schedule.find({ classroom: { $in: classIds }, teacher: { $ne: null } })
      .select("teacher classroom subject")
      .populate("teacher", "firstName lastName")
      .populate("subject", "name noMarks")
      .lean(),
  ]);

  const pairs = new Map();
  const covered = new Set();
  // Asked for one teacher, the others' classes are left out — but only
  // after their assignments have claimed their pairs, so a timetable slot
  // assigned to someone else is never counted as this teacher's.
  const mine = (row) => !teacherId || String(row.teacher._id) === String(teacherId);
  for (const row of assigned) {
    if (!row.teacher || !row.subject || row.subject.noMarks) continue;
    covered.add(pairKey(row.classroom, row.subject._id));
    if (mine(row)) pairs.set(`${row.teacher._id}:${pairKey(row.classroom, row.subject._id)}`, row);
  }
  for (const row of timetabled) {
    if (!row.teacher || !row.subject || row.subject.noMarks) continue;
    const key = pairKey(row.classroom, row.subject._id);
    if (covered.has(key) || !mine(row)) continue;
    pairs.set(`${row.teacher._id}:${key}`, row);
  }

  const [students, electives] = await Promise.all([
    Student.find({ classroom: { $in: classIds }, active: { $ne: false } })
      .select("_id classroom secondLanguage")
      .lean(),
    electivesByClass(classIds),
  ]);
  const sizes = new Map();
  const classOfStudent = new Map();
  for (const s of students) {
    sizes.set(String(s.classroom), (sizes.get(String(s.classroom)) || 0) + 1);
    classOfStudent.set(String(s._id), String(s.classroom));
  }
  // Only the class's own pupils count towards it: a mark left under a class
  // by a pupil who has since moved class or left the school would otherwise
  // make it look marked ("4 of 34" with none of the 34 marked).
  const onRoster = (doc) => classOfStudent.get(String(doc.student)) === String(doc.classroom);
  // What a class owes marks for: all of it, or — in one of its «مادة ثانية»
  // languages — the pupils taking it (and those not yet given one).
  const sizeFor = (classroomId, subjectId) => {
    if (!electives.get(String(classroomId))?.has(String(subjectId))) return sizes.get(String(classroomId)) || 0;
    return students.filter(
      (s) =>
        String(s.classroom) === String(classroomId) &&
        (!s.secondLanguage || String(s.secondLanguage) === String(subjectId)),
    ).length;
  };

  const inClasses = { classroom: { $in: classIds } };
  const window = { $gte: range.start, $lte: range.end };
  const classicClassIds = classrooms.filter((c) => schemeOf(c) === "classic").map((c) => c._id);
  const classicStudentIds = students
    .filter((s) => classicClassIds.some((id) => String(id) === String(s.classroom)))
    .map((s) => s._id);

  // The weeks' marks — not read at all for the tests view.
  const weekly = kind === "weeks";
  const [evaluations, notebooks, overrides, homework, attendance, tests] = await Promise.all([
    weekly
      ? WeeklyEvaluation.find({ ...inClasses, weekStart: window }).select("classroom subject student weekStart updatedAt").lean()
      : [],
    weekly
      ? ClassworkNotebook.find({ ...inClasses, weekStart: window }).select("classroom subject student weekStart updatedAt").lean()
      : [],
    weekly
      ? CourseworkOverride.find({ ...inClasses, weekStart: window })
          .select("classroom subject student weekStart attendanceScore homeworkScore updatedAt")
          .lean()
      : [],
    weekly ? Homework.find({ ...inClasses, createdAt: window }).select("classroom subject createdAt").lean() : [],
    // Only the classic register has an attendance column worked out from
    // the register; weekly40's مواظبة وسلوك is typed by the teacher.
    weekly && classicStudentIds.length
      ? Attendance.find({ student: { $in: classicStudentIds }, date: window, ...Attendance.GRADED_ONLY })
          .select("student subject date")
          .lean()
      : [],
    weekly ? null : testEntry({ classrooms, schemeOf, range, onRoster }),
  ]);

  const homeworkResults = homework.length
    ? await HomeworkResult.find({ homework: { $in: homework.map((h) => h._id) } }).select("homework student updatedAt").lean()
    : [];

  const byPair = (doc) => pairKey(doc.classroom, doc.subject);
  const weeklyTally = tally(evaluations.filter(onRoster), byPair);
  const classworkTally = tally(notebooks.filter(onRoster), byPair);
  const attendanceOverride = tally(
    overrides.filter((o) => onRoster(o) && o.attendanceScore !== null && o.attendanceScore !== undefined),
    byPair,
  );
  const homeworkOverride = tally(
    overrides.filter((o) => onRoster(o) && o.homeworkScore !== null && o.homeworkScore !== undefined),
    byPair,
  );

  // A homework belongs to the week it was set in (utils/weekScores.js).
  const homeworkById = new Map(homework.map((h) => [String(h._id), h]));
  const homeworkTally = tally(
    homeworkResults
      .map((r) => {
        const h = homeworkById.get(String(r.homework));
        return { classroom: h.classroom, subject: h.subject, student: r.student, weekStart: h.createdAt, updatedAt: r.updatedAt };
      })
      .filter(onRoster),
    byPair,
  );
  const homeworkSet = new Map();
  for (const h of homework) homeworkSet.set(byPair(h), (homeworkSet.get(byPair(h)) || 0) + 1);

  // On a daily register a day's attendance stands for every subject; on a
  // per-lesson one it belongs to the lesson's subject.
  const attendanceByClass = tally(attendance, (a) => classOfStudent.get(String(a.student)), (a) => a.date);
  const attendanceByPair = tally(
    attendance.filter((a) => a.subject),
    (a) => pairKey(classOfStudent.get(String(a.student)), a.subject),
    (a) => a.date,
  );

  // A school whose teachers enter مواظبة وسلوك by hand (School.
  // conductEnteredFrom, Al-Rahma): there it is the teacher's mark in every
  // week, counted from what they entered alone — attendance never stands in
  // for it, here.
  const conductFromOf = (classroom) => schoolById.get(String(classroom.school))?.conductEnteredFrom || null;

  const sources = (key, classroom) => {
    const daily = dailyBySchool.get(String(classroom.school));
    const register = daily ? attendanceByClass.get(String(classroom._id)) : attendanceByPair.get(key);
    return {
      attendance: merge(register, attendanceOverride.get(key)),
      homework: merge(homeworkTally.get(key), homeworkOverride.get(key)),
      weekly: weeklyTally.get(key),
      classwork: classworkTally.get(key),
      conduct: attendanceOverride.get(key),
    };
  };

  // The classic مواظبة is the teacher's مواظبة وسلوك at such a school.
  const columnsFor = (scheme, classroom) => {
    const from = conductFromOf(classroom);
    if (scheme !== "classic" || !from) return REGISTER_COLUMNS[scheme];
    return REGISTER_COLUMNS.classic.map((col) =>
      col.key === "attendance" ? { key: "conduct", label: "مواظبة وسلوك", maxField: "attendanceScore", entered: true } : col,
    );
  };

  const teachers = new Map();
  for (const row of pairs.values()) {
    const classroom = classById.get(String(row.classroom));
    if (!classroom) continue;
    const size = sizeFor(row.classroom, row.subject._id);
    if (size === 0) continue; // a class with no pupils owes no marks

    const scheme = schemeOf(classroom);
    const rules = SCHEMES[scheme];
    const key = pairKey(row.classroom, row.subject._id);
    const src = sources(key, classroom);
    const set = homeworkSet.get(key) || 0;

    let columns;
    let lasts;
    if (weekly) {
      columns = columnsFor(scheme, classroom).map((col) => ({
        key: col.key,
        label: col.label,
        max: rules.max[col.maxField],
        entered: col.entered,
        // Kept for the screens that read it; every column applies every week.
        applicable: true,
        ...measure(src[col.key], size, range.weeks, range.period),
      }));
      lasts = ["homework", "weekly", "classwork", "conduct"].map((k) => src[k]?.last).filter(Boolean);
    } else {
      const entry = tests.columnsFor(key, scheme, size);
      columns = entry.columns;
      lasts = entry.last ? [entry.last] : [];
    }

    // Complete when every column the teacher fills in is in for the whole
    // class. The classic مواظبة (outside a school that enters it by hand)
    // follows the attendance register on its own and isn't the teacher's
    // marking to do.
    const owed = columns.filter((c) => c.entered);
    const teacherAny = columns.some((c) => c.any && c.key !== "attendance");
    let status = "none";
    if (owed.every((c) => c.full)) status = "complete";
    else if (teacherAny) status = "partial";
    if (range.weeks.length === 0) status = teacherAny ? "complete" : "none";

    const teacherId = String(row.teacher._id);
    if (!teachers.has(teacherId)) {
      teachers.set(teacherId, {
        id: teacherId,
        name: `${row.teacher.firstName} ${row.teacher.lastName}`.trim(),
        classes: [],
      });
    }
    teachers.get(teacherId).classes.push({
      classroomId: String(row.classroom),
      classroom: classroom.name,
      gradeId: classroom.grade?._id ? String(classroom.grade._id) : null,
      grade: classroom.grade?.name || "",
      subjectId: String(row.subject._id),
      subject: row.subject.name,
      scheme,
      students: size,
      status,
      homeworkSet: set,
      columns,
      lastEntryAt: lasts.length ? new Date(Math.max(...lasts.map((d) => new Date(d).getTime()))) : null,
    });
  }

  // The last time each teacher recorded anything at all, not only inside
  // this window — "لم يرصد" this week reads very differently for someone
  // who marked last week and someone who never has.
  const teacherIds = [...teachers.keys()].map((id) => new mongoose.Types.ObjectId(id));
  const lastBy = async (Model, field) =>
    Model.aggregate([
      { $match: { [field]: { $in: teacherIds } } },
      { $group: { _id: `$${field}`, last: { $max: "$updatedAt" } } },
    ]);
  const lastRows = (
    await Promise.all([
      lastBy(WeeklyEvaluation, "teacher"),
      lastBy(ClassworkNotebook, "teacher"),
      lastBy(CourseworkOverride, "teacher"),
      lastBy(HomeworkResult, "gradedBy"),
      lastBy(MonthlyGrade, "teacher"),
      lastBy(TermTest, "teacher"),
    ])
  ).flat();
  const lastEver = new Map();
  for (const row of lastRows) {
    const key = String(row._id);
    if (!lastEver.get(key) || row.last > lastEver.get(key)) lastEver.set(key, row.last);
  }

  const list = [...teachers.values()].map((t) => {
    const statuses = t.classes.map((c) => c.status);
    const status = statuses.every((s) => s === "complete")
      ? "complete"
      : statuses.every((s) => s === "none")
        ? "none"
        : "partial";
    t.classes.sort((a, b) => rank[a.status] - rank[b.status] || a.classroom.localeCompare(b.classroom, "ar"));
    return { ...t, status, lastEntryAt: lastEver.get(t.id) || null };
  });
  list.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "ar"));

  return {
    kind,
    // The tests view's month, and the term its weekly40 tests are of.
    ...(weekly ? {} : { month: tests.month, year: tests.year, term: tests.term }),
    period: range.period,
    start: range.start,
    end: range.end,
    weeks: range.weeks,
    summary: {
      teachers: list.length,
      complete: list.filter((t) => t.status === "complete").length,
      partial: list.filter((t) => t.status === "partial").length,
      none: list.filter((t) => t.status === "none").length,
    },
    teachers: list,
  };
};

exports.getGradeEntry = async (req, res) => {
  try {
    // ?kind=tests: who recorded the month's test — always a whole month.
    const kind = req.query.kind === "tests" ? "tests" : "weeks";
    const range = reportPeriod(kind === "tests" ? "month" : req.query.period, req.query.date);

    const classFilter = scopeFilter(req, {}, "grade");
    if (!classFilter) {
      return res.status(400).json({ message: "Please specify a school (?school=id) for this report." });
    }

    return res.status(200).json(await buildGradeEntry({ classFilter, range, kind }));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// «آخر التطورات» in the teacher app: the same report for one week, for the
// teacher's own classes — what is recorded and what is still to do.
exports.getMyGradeEntry = async (req, res) => {
  try {
    const range = reportPeriod("week", req.query.date);
    const report = await buildGradeEntry({
      classFilter: { school: req.user.school },
      range,
      teacherId: req.user.id,
    });
    const mine = report.teachers[0];

    return res.status(200).json({
      start: report.start,
      end: report.end,
      weeks: report.weeks,
      status: mine?.status || "none",
      classes: mine?.classes || [],
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
