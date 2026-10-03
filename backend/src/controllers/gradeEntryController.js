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

const REGISTER_COLUMNS = {
  classic: [
    // Worked out from the attendance register, or set by the teacher.
    { key: "attendance", label: "مواظبة", maxField: "attendanceScore", entered: false },
    { key: "homework", label: "واجب", maxField: "homeworkScore", entered: false },
    { key: "weekly", label: "تقييم أسبوعي", maxField: "weeklyEvalScore", entered: true },
    { key: "classwork", label: "كراسة الحصة", maxField: "classworkScore", entered: true },
  ],
  weekly40: [
    { key: "homework", label: "الواجب المنزلي", maxField: "homeworkScore", entered: false },
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

exports.getGradeEntry = async (req, res) => {
  try {
    const range = reportPeriod(req.query.period, req.query.date);

    const classFilter = scopeFilter(req, {}, "grade");
    if (!classFilter) {
      return res.status(400).json({ message: "Please specify a school (?school=id) for this report." });
    }

    const classrooms = await Classroom.find(classFilter)
      .select("name grade school")
      .populate("grade", "name stage")
      .lean();
    const classIds = classrooms.map((c) => c._id);
    const classById = new Map(classrooms.map((c) => [String(c._id), c]));

    const schoolIds = [...new Set(classrooms.map((c) => String(c.school)))];
    const schools = await School.find({ _id: { $in: schoolIds } }).select("gradebook").lean();
    const schoolById = new Map(schools.map((s) => [String(s._id), s]));
    const dailyBySchool = new Map(
      await Promise.all(schoolIds.map(async (id) => [id, await isDailyMode(id)])),
    );
    const schemeOf = (classroom) => schemeFor(schoolById.get(String(classroom.school)), classroom.grade?.stage);

    // Who teaches what: the school's assignments first, then the timetable.
    // A period with no teacher (طابور, نشاط) owes no marks and is left out.
    const [assigned, timetabled] = await Promise.all([
      ClassAssignment.find({ classroom: { $in: classIds } })
        .select("teacher classroom subject")
        .populate("teacher", "firstName lastName")
        .populate("subject", "name")
        .lean(),
      Schedule.find({ classroom: { $in: classIds }, teacher: { $ne: null } })
        .select("teacher classroom subject")
        .populate("teacher", "firstName lastName")
        .populate("subject", "name")
        .lean(),
    ]);

    const pairs = new Map();
    const covered = new Set();
    for (const row of assigned) {
      if (!row.teacher || !row.subject) continue;
      covered.add(pairKey(row.classroom, row.subject._id));
      pairs.set(`${row.teacher._id}:${pairKey(row.classroom, row.subject._id)}`, row);
    }
    for (const row of timetabled) {
      if (!row.teacher || !row.subject) continue;
      const key = pairKey(row.classroom, row.subject._id);
      if (covered.has(key)) continue;
      pairs.set(`${row.teacher._id}:${key}`, row);
    }

    const students = await Student.find({ classroom: { $in: classIds }, active: { $ne: false } })
      .select("_id classroom")
      .lean();
    const sizes = new Map();
    const classOfStudent = new Map();
    for (const s of students) {
      sizes.set(String(s.classroom), (sizes.get(String(s.classroom)) || 0) + 1);
      classOfStudent.set(String(s._id), String(s.classroom));
    }

    const inClasses = { classroom: { $in: classIds } };
    const window = { $gte: range.start, $lte: range.end };
    const classicClassIds = classrooms.filter((c) => schemeOf(c) === "classic").map((c) => c._id);
    const classicStudentIds = students
      .filter((s) => classicClassIds.some((id) => String(id) === String(s.classroom)))
      .map((s) => s._id);

    const [evaluations, notebooks, overrides, homework, attendance] = await Promise.all([
      WeeklyEvaluation.find({ ...inClasses, weekStart: window }).select("classroom subject student weekStart updatedAt").lean(),
      ClassworkNotebook.find({ ...inClasses, weekStart: window }).select("classroom subject student weekStart updatedAt").lean(),
      CourseworkOverride.find({ ...inClasses, weekStart: window })
        .select("classroom subject student weekStart attendanceScore homeworkScore updatedAt")
        .lean(),
      Homework.find({ ...inClasses, createdAt: window }).select("classroom subject createdAt").lean(),
      // Only the classic register has an attendance column worked out from
      // the register; weekly40's مواظبة وسلوك is typed by the teacher.
      classicStudentIds.length
        ? Attendance.find({ student: { $in: classicStudentIds }, date: window, ...Attendance.GRADED_ONLY })
            .select("student subject date")
            .lean()
        : [],
    ]);

    const homeworkResults = homework.length
      ? await HomeworkResult.find({ homework: { $in: homework.map((h) => h._id) } }).select("homework student updatedAt").lean()
      : [];

    const byPair = (doc) => pairKey(doc.classroom, doc.subject);
    const weeklyTally = tally(evaluations, byPair);
    const classworkTally = tally(notebooks, byPair);
    const attendanceOverride = tally(
      overrides.filter((o) => o.attendanceScore !== null && o.attendanceScore !== undefined),
      byPair,
    );
    const homeworkOverride = tally(
      overrides.filter((o) => o.homeworkScore !== null && o.homeworkScore !== undefined),
      byPair,
    );

    // A homework belongs to the week it was set in (utils/weekScores.js).
    const homeworkById = new Map(homework.map((h) => [String(h._id), h]));
    const homeworkTally = tally(
      homeworkResults.map((r) => {
        const h = homeworkById.get(String(r.homework));
        return { classroom: h.classroom, subject: h.subject, student: r.student, weekStart: h.createdAt, updatedAt: r.updatedAt };
      }),
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

    const sources = (key, classroom) => {
      const daily = dailyBySchool.get(String(classroom.school));
      return {
        attendance: merge(
          daily ? attendanceByClass.get(String(classroom._id)) : attendanceByPair.get(key),
          attendanceOverride.get(key),
        ),
        homework: merge(homeworkTally.get(key), homeworkOverride.get(key)),
        weekly: weeklyTally.get(key),
        classwork: classworkTally.get(key),
        conduct: attendanceOverride.get(key),
      };
    };

    const teachers = new Map();
    for (const row of pairs.values()) {
      const classroom = classById.get(String(row.classroom));
      if (!classroom) continue;
      const size = sizes.get(String(row.classroom)) || 0;
      if (size === 0) continue; // a class with no pupils owes no marks

      const scheme = schemeOf(classroom);
      const rules = SCHEMES[scheme];
      const key = pairKey(row.classroom, row.subject._id);
      const src = sources(key, classroom);
      const set = homeworkSet.get(key) || 0;

      const columns = REGISTER_COLUMNS[scheme].map((col) => ({
        key: col.key,
        label: col.label,
        max: rules.max[col.maxField],
        entered: col.entered,
        // No homework set in the period means nothing to print in that column.
        applicable: col.key === "homework" ? set > 0 || Boolean(src.homework) : true,
        ...measure(src[col.key], size, range.weeks, range.period),
      }));

      // Complete when every column the teacher fills in is in for the whole
      // class, and so is the homework if any was set. The classic مواظبة
      // follows the attendance register on its own and isn't the teacher's
      // marking to do.
      const owed = columns.filter((c) => c.entered || (c.key === "homework" && c.applicable));
      const teacherAny = columns.some((c) => c.any && c.key !== "attendance");
      let status = "none";
      if (owed.every((c) => c.full)) status = "complete";
      else if (teacherAny) status = "partial";
      if (range.weeks.length === 0) status = teacherAny ? "complete" : "none";

      const lasts = ["homework", "weekly", "classwork", "conduct"].map((k) => src[k]?.last).filter(Boolean);

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
        grade: classroom.grade?.name || "",
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

    res.status(200).json({
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
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
