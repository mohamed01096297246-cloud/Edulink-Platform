const mongoose = require("mongoose");
const Classroom = require("../models/Classroom");
const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const Student = require("../models/Student");
const School = require("../models/School");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const MonthlyGrade = require("../models/MonthlyGrade");
const TermTest = require("../models/TermTest");
const Behavior = require("../models/Behavior");
// Registered for the populates below, not used directly.
require("../models/Subject");
require("../models/User");
require("../models/Grade");
const { scopeFilter } = require("../utils/tenant");
const { SCHEMES, schemeFor } = require("../utils/gradebook");
const { reportPeriod, weekKey } = require("../utils/reportPeriod");

// "رصد الدرجات" — for a week or a month, which teachers have recorded marks
// for their classes and which have not. Read only, over the same documents
// the teacher's app writes; nothing here is entered or changed.
//
// What a class owes each week depends on its school's scheme for that
// stage (utils/gradebook.js), so two schools are measured against their own
// registers:
//   classic   تقييم أسبوعي + كراسة الحصة
//   weekly40  تقييم أسبوعي + مواظبة وسلوك
// Homework, monthly or term tests and behaviour notes are reported
// alongside, but a class that sets no homework isn't behind for it.

const pairKey = (classroom, subject) => `${classroom}:${subject}`;

// Every entry of one kind in the window, as { pair → { students, weeks } }.
const tally = (docs, keyOf) => {
  const out = new Map();
  for (const doc of docs) {
    const key = keyOf(doc);
    if (!out.has(key)) out.set(key, { students: new Set(), weeks: new Map(), last: null });
    const bucket = out.get(key);
    bucket.students.add(String(doc.student));
    const week = weekKey(doc.weekStart).getTime();
    if (!bucket.weeks.has(week)) bucket.weeks.set(week, new Set());
    bucket.weeks.get(week).add(String(doc.student));
    if (!bucket.last || doc.updatedAt > bucket.last) bucket.last = doc.updatedAt;
  }
  return out;
};

// One required column for one class, measured against the period.
//   week   — how many of the class's students have a mark
//   month  — how many of the month's weeks have marks for the whole class
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
  return { students, weeksDone, weeksPartial, full, any: true };
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

    const pairs = new Map(); // `${teacher}:${classroom}:${subject}` → pair
    const covered = new Set(); // classroom:subject already owned by an assignment
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

    const sizes = new Map(
      (
        await Student.aggregate([
          { $match: { classroom: { $in: classIds }, active: { $ne: false } } },
          { $group: { _id: "$classroom", n: { $sum: 1 } } },
        ])
      ).map((r) => [String(r._id), r.n]),
    );

    const inClasses = { classroom: { $in: classIds } };
    const weekWindow = { $gte: range.start, $lte: range.end };
    const months = [];
    for (let d = new Date(range.start); d <= range.end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      months.push({ month: d.getUTCMonth() + 1, year: d.getUTCFullYear() });
    }

    const [evaluations, notebooks, conduct, homework, monthly, termTests, notes] = await Promise.all([
      WeeklyEvaluation.find({ ...inClasses, weekStart: weekWindow }).select("classroom subject student weekStart updatedAt").lean(),
      ClassworkNotebook.find({ ...inClasses, weekStart: weekWindow }).select("classroom subject student weekStart updatedAt").lean(),
      CourseworkOverride.find({ ...inClasses, weekStart: weekWindow, attendanceScore: { $ne: null } })
        .select("classroom subject student weekStart updatedAt")
        .lean(),
      Homework.find({ ...inClasses, createdAt: weekWindow }).select("classroom subject createdAt").lean(),
      range.period === "month"
        ? MonthlyGrade.find({ ...inClasses, $or: months }).select("classroom subject student").lean()
        : [],
      TermTest.find({ ...inClasses, updatedAt: weekWindow }).select("classroom subject student").lean(),
      Behavior.find({ ...inClasses, date: weekWindow }).select("classroom subject").lean(),
    ]);

    const homeworkResults = homework.length
      ? await HomeworkResult.find({ homework: { $in: homework.map((h) => h._id) } }).select("homework updatedAt").lean()
      : [];

    const byPair = (doc) => pairKey(doc.classroom, doc.subject);
    const evalTally = tally(evaluations, byPair);
    const notebookTally = tally(notebooks, byPair);
    const conductTally = tally(conduct, byPair);

    const count = (docs) => {
      const out = new Map();
      for (const doc of docs) out.set(byPair(doc), (out.get(byPair(doc)) || 0) + 1);
      return out;
    };
    const homeworkSet = count(homework);
    const monthlyCount = count(monthly);
    const termCount = count(termTests);
    const noteCount = count(notes);

    const homeworkPair = new Map(homework.map((h) => [String(h._id), byPair(h)]));
    const homeworkGraded = new Map();
    const homeworkLast = new Map();
    for (const r of homeworkResults) {
      const key = homeworkPair.get(String(r.homework));
      homeworkGraded.set(key, (homeworkGraded.get(key) || 0) + 1);
      if (!homeworkLast.get(key) || r.updatedAt > homeworkLast.get(key)) homeworkLast.set(key, r.updatedAt);
    }

    const teachers = new Map();
    for (const row of pairs.values()) {
      const classroom = classById.get(String(row.classroom));
      if (!classroom) continue;
      const size = sizes.get(String(row.classroom)) || 0;
      if (size === 0) continue; // a class with no pupils owes no marks

      const scheme = schemeOf(classroom);
      const rules = SCHEMES[scheme];
      const key = pairKey(row.classroom, row.subject._id);

      const weekly = measure(evalTally.get(key), size, range.weeks, range.period);
      const second = rules.classwork
        ? { kind: "classwork", ...measure(notebookTally.get(key), size, range.weeks, range.period) }
        : { kind: "conduct", ...measure(conductTally.get(key), size, range.weeks, range.period) };

      const set = homeworkSet.get(key) || 0;
      const graded = homeworkGraded.get(key) || 0;

      // Behaviour notes are reported, but they are not marks.
      const tests = (monthlyCount.get(key) || 0) + (termCount.get(key) || 0);
      const anything = weekly.any || second.any || graded > 0 || tests > 0;
      let status = "none";
      if (weekly.full && second.full) status = "complete";
      else if (anything) status = "partial";
      // Nothing is owed yet for a week that hasn't started.
      if (range.weeks.length === 0) status = anything ? "complete" : "none";

      const lastDates = [
        evalTally.get(key)?.last,
        notebookTally.get(key)?.last,
        conductTally.get(key)?.last,
        homeworkLast.get(key),
      ].filter(Boolean);

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
        weekly,
        second,
        homework: { set, graded, expected: set * size },
        monthlyTests: monthlyCount.get(key) || 0,
        termTests: termCount.get(key) || 0,
        behaviorNotes: noteCount.get(key) || 0,
        lastEntryAt: lastDates.length ? new Date(Math.max(...lastDates.map((d) => new Date(d).getTime()))) : null,
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
