const mongoose = require("mongoose");
const Classroom = require("../models/Classroom");
const Subject = require("../models/Subject");
const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const MarkingSkip = require("../models/MarkingSkip");
require("../models/User");
const { scopeFilter } = require("../utils/tenant");
const { SCHEMES, schemeForClassroom } = require("../utils/gradebook");
const { toWeekStart } = require("../utils/weekScores");
const { markedWeeks, weekStartOf, hasWeeklyEval } = require("../utils/schoolMonths");
const { columnsOf, LABELS, outOf, skipsOf, everySchoolSkips } = require("../utils/markingSkips");

// «رفع بند من الرصد» (Mohamed, 2026-10-31): a teacher tells the school there
// was no تقييم أسبوعي (or كراسة الحصة, or any column of the week) in their
// subject this week, and an admin takes that column off for the classes
// they choose. The week is then out of the columns left, everywhere — the
// teacher's screens, the register, the parent, the student, the month
// (utils/markingSkips.js). Taken off, not deleted: marks already filed stay
// and count again if the column is put back. Every school has it; a school
// split into stages leaves it to the stage principals (STAGE_RUN_DATA).

const DAY = 24 * 60 * 60 * 1000;
const idOf = (value) => String(value?._id || value || "");
const nameOf = (u) => (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "");
const isoDay = (date) => new Date(date).toISOString().slice(0, 10);

// The weeks a column can be taken off for: every marked week so far, and
// the next one, for a teacher who says so ahead of time. Newest first.
const weeksOffered = (today = new Date()) => {
  const thisWeek = weekStartOf(today).getTime();
  return markedWeeks(new Date(today.getTime() + 7 * DAY)).map((w) => ({
    weekStart: isoDay(w.weekStart),
    label: w.label,
    from: isoDay(w.from),
    to: isoDay(w.to),
    current: w.weekStart.getTime() === thisWeek,
    next: w.weekStart.getTime() > thisWeek,
    // تقييم أسبوعي is off in every school that week already.
    noWeeklyEval: !hasWeeklyEval(w.weekStart),
  }));
};

// Who has each subject in each class: the class assignment first, then the
// timetable — the order every teacher screen settles it in. A subject with
// no marks (Subject.noMarks) has nothing to take off.
const teachersOf = async (classIds) => {
  const [assigned, lessons] = await Promise.all([
    ClassAssignment.find({ classroom: { $in: classIds } })
      .populate("subject", "name noMarks")
      .populate("teacher", "firstName lastName")
      .lean(),
    Schedule.find({ classroom: { $in: classIds }, teacher: { $ne: null } })
      .populate("subject", "name noMarks")
      .populate("teacher", "firstName lastName")
      .lean(),
  ]);
  const byPair = new Map();
  for (const row of [...assigned, ...lessons]) {
    if (!row.subject || row.subject.noMarks || !row.teacher) continue;
    const pair = `${row.classroom}:${row.subject._id}`;
    if (!byPair.has(pair)) byPair.set(pair, { teacher: row.teacher, subject: row.subject, classroom: row.classroom });
  }
  return byPair;
};

const classesInScope = (req, extra = {}) => {
  const filter = scopeFilter(req, extra, "grade");
  return filter ? Classroom.find(filter).populate("grade", "name").select("name grade school").lean() : null;
};

// Each class's scheme, read once per class.
const schemesOf = async (classrooms) =>
  new Map(await Promise.all(classrooms.map(async (c) => [String(c._id), await schemeForClassroom(c)])));

const schemeShapes = () =>
  Object.fromEntries(
    Object.keys(SCHEMES).map((scheme) => [scheme, { weekTotal: SCHEMES[scheme].weekTotal, columns: columnsOf(scheme) }]),
  );

// GET /marking-skips/options — the weeks, and every teacher with their
// subjects and, under each, the classes they take it in.
exports.getOptions = async (req, res) => {
  try {
    const query = classesInScope(req);
    if (!query) return res.status(400).json({ success: false, message: "Please specify a school (?school=id)." });
    const classrooms = await query;
    const classById = new Map(classrooms.map((c) => [String(c._id), c]));
    const [pairs, schemes] = await Promise.all([teachersOf(classrooms.map((c) => c._id)), schemesOf(classrooms)]);

    const teachers = new Map();
    for (const { teacher, subject, classroom } of pairs.values()) {
      const cls = classById.get(String(classroom));
      if (!cls) continue;
      const tKey = String(teacher._id);
      if (!teachers.has(tKey)) teachers.set(tKey, { _id: teacher._id, name: nameOf(teacher), subjects: new Map() });
      const subjects = teachers.get(tKey).subjects;
      if (!subjects.has(String(subject._id))) subjects.set(String(subject._id), { _id: subject._id, name: subject.name, classes: [] });
      subjects.get(String(subject._id)).classes.push({
        _id: cls._id,
        name: cls.name,
        grade: cls.grade?.name || "",
        scheme: schemes.get(String(cls._id)),
      });
    }

    const byName = (a, b) => String(a.name).localeCompare(String(b.name), "ar");
    const list = [...teachers.values()]
      .map((t) => ({
        ...t,
        subjects: [...t.subjects.values()]
          .map((s) => ({
            ...s,
            classes: s.classes.sort((a, b) => a.grade.localeCompare(b.grade, "ar") || byName(a, b)),
          }))
          .sort(byName),
      }))
      .sort(byName);

    return res.status(200).json({
      success: true,
      data: { weeks: weeksOffered(), teachers: list, schemes: schemeShapes() },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /marking-skips — every column taken off (or put back, `restored`) in
// the caller's classes, newest week first, with the class, subject, teacher
// and what the week is out of now.
exports.list = async (req, res) => {
  try {
    const query = classesInScope(req);
    if (!query) return res.status(400).json({ success: false, message: "Please specify a school (?school=id)." });
    const classrooms = await query;
    const classById = new Map(classrooms.map((c) => [String(c._id), c]));
    const docs = await MarkingSkip.find({ classroom: { $in: classrooms.map((c) => c._id) } })
      .populate("subject", "name")
      .populate("by", "firstName lastName")
      .sort({ weekStart: -1, updatedAt: -1 })
      .lean();
    const [pairs, schemes] = await Promise.all([
      teachersOf([...new Set(docs.map((d) => String(d.classroom)))]),
      schemesOf(classrooms.filter((c) => docs.some((d) => String(d.classroom) === String(c._id)))),
    ]);
    const weekLabel = new Map(markedWeeks(new Date(Date.now() + 7 * DAY)).map((w) => [isoDay(w.weekStart), w.label]));

    const items = docs.map((d) => {
      const cls = classById.get(String(d.classroom));
      const scheme = schemes.get(String(d.classroom));
      const shape = columnsOf(scheme);
      const taken = new Set(d.columns);
      const back = new Set(d.restored || []);
      const pair = pairs.get(`${d.classroom}:${idOf(d.subject)}`);
      return {
        _id: d._id,
        weekStart: isoDay(d.weekStart),
        week: weekLabel.get(isoDay(d.weekStart)) || "",
        classroom: { _id: d.classroom, name: cls?.name || "", grade: cls?.grade?.name || "" },
        subject: { _id: idOf(d.subject), name: d.subject?.name || "" },
        teacher: nameOf(pair?.teacher),
        columns: shape.filter((c) => taken.has(c.key)).map(({ key, label }) => ({ key, label })),
        restored: shape.filter((c) => back.has(c.key)).map(({ key, label }) => ({ key, label })),
        weekTotal: SCHEMES[scheme].weekTotal,
        outOf: outOf(scheme, skipsOf(d.weekStart, d)),
        by: nameOf(d.by),
        updatedAt: d.updatedAt,
      };
    });

    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /marking-skips — { weekStart, subject, classrooms: [ids], columns:
// [keys] }: takes those columns off that week, in each class given, adding
// to whatever was taken off there already. A column a class's scheme
// doesn't have (كراسة الحصة on weekly40) is left out for that class.
exports.takeOff = async (req, res) => {
  try {
    const weekStart = toWeekStart(req.body.weekStart);
    if (!weekStart || !weeksOffered().some((w) => w.weekStart === isoDay(weekStart))) {
      return res.status(400).json({ success: false, message: "اختار الأسبوع." });
    }
    const subjectId = idOf(req.body.subject);
    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ success: false, message: "اختار المادة." });
    }
    const asked = Array.isArray(req.body.columns) ? req.body.columns.filter((c) => LABELS[c]) : [];
    if (asked.length === 0) {
      return res.status(400).json({ success: false, message: "اختار البند اللي هيترفع من الرصد." });
    }
    const ids = (Array.isArray(req.body.classrooms) ? req.body.classrooms : []).map(idOf).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "اختار فصل واحد على الأقل." });
    }

    const query = classesInScope(req, { _id: { $in: ids } });
    if (!query) return res.status(400).json({ success: false, message: "Please specify a school (?school=id)." });
    const classrooms = await query;
    if (classrooms.length !== new Set(ids).size) {
      return res.status(404).json({ success: false, message: "فيه فصل مش موجود أو مش من مدرستك." });
    }
    const subject = await Subject.findOne({ _id: subjectId, school: classrooms[0].school }).select("name noMarks").lean();
    if (!subject || subject.noMarks) {
      return res.status(400).json({ success: false, message: "المادة دي مالهاش درجات." });
    }

    const schemes = await schemesOf(classrooms);
    const ops = [];
    for (const c of classrooms) {
      const columns = asked.filter((key) => SCHEMES[schemes.get(String(c._id))].max[key] !== undefined);
      if (columns.length === 0) continue;
      ops.push({
        updateOne: {
          filter: { classroom: c._id, subject: subject._id, weekStart },
          update: {
            $addToSet: { columns: { $each: columns } },
            $set: { school: c.school, by: req.user._id },
          },
          upsert: true,
        },
      });
    }
    if (ops.length === 0) {
      return res.status(400).json({ success: false, message: "البند ده مش موجود في كشف الفصول دي." });
    }
    await MarkingSkip.bulkWrite(ops);

    const what = asked.map((key) => `«${LABELS[key]}»`).join(" و");
    const n = ops.length;
    const where = n === 1 ? "فصل واحد" : n === 2 ? "فصلين" : n <= 10 ? `${n} فصول` : `${n} فصل`;
    return res.status(200).json({ success: true, message: `اترفع ${what} من ${subject.name} في ${where}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /marking-skips/restore — { weekStart, subject, classrooms, columns }:
// the other way round. A column off in every school that week (the week 6
// evaluation) is put back for those classes in that subject (Mohamed,
// 2026-10-31: «انا عايز ارجع تقيم الاسبوع لبعض الفصول وبعض المواد»): the
// teacher records it, and the week counts it as in any other week, marks
// already filed under it included. The other classes and subjects keep it off.
exports.restore = async (req, res) => {
  try {
    const weekStart = toWeekStart(req.body.weekStart);
    if (!weekStart || !weeksOffered().some((w) => w.weekStart === isoDay(weekStart))) {
      return res.status(400).json({ success: false, message: "اختار الأسبوع." });
    }
    const subjectId = idOf(req.body.subject);
    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ success: false, message: "اختار المادة." });
    }
    const offEverywhere = everySchoolSkips(weekStart);
    const asked = Array.isArray(req.body.columns) ? req.body.columns.filter((c) => offEverywhere.includes(c)) : [];
    if (asked.length === 0) {
      return res.status(400).json({ success: false, message: "البند ده مش مترفع في كل المدارس الأسبوع ده." });
    }
    const ids = (Array.isArray(req.body.classrooms) ? req.body.classrooms : []).map(idOf).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "اختار فصل واحد على الأقل." });
    }

    const query = classesInScope(req, { _id: { $in: ids } });
    if (!query) return res.status(400).json({ success: false, message: "Please specify a school (?school=id)." });
    const classrooms = await query;
    if (classrooms.length !== new Set(ids).size) {
      return res.status(404).json({ success: false, message: "فيه فصل مش موجود أو مش من مدرستك." });
    }
    const subject = await Subject.findOne({ _id: subjectId, school: classrooms[0].school }).select("name noMarks").lean();
    if (!subject || subject.noMarks) {
      return res.status(400).json({ success: false, message: "المادة دي مالهاش درجات." });
    }

    const schemes = await schemesOf(classrooms);
    const ops = [];
    for (const c of classrooms) {
      const columns = asked.filter((key) => SCHEMES[schemes.get(String(c._id))].max[key] !== undefined);
      if (columns.length === 0) continue;
      ops.push({
        updateOne: {
          filter: { classroom: c._id, subject: subject._id, weekStart },
          update: {
            $addToSet: { restored: { $each: columns } },
            // Back means back: not also taken off by the admin.
            $pull: { columns: { $in: columns } },
            $set: { school: c.school, by: req.user._id },
          },
          upsert: true,
        },
      });
    }
    if (ops.length === 0) {
      return res.status(400).json({ success: false, message: "البند ده مش موجود في كشف الفصول دي." });
    }
    await MarkingSkip.bulkWrite(ops);

    const what = asked.map((key) => `«${LABELS[key]}»`).join(" و");
    const n = ops.length;
    const where = n === 1 ? "فصل واحد" : n === 2 ? "فصلين" : n <= 10 ? `${n} فصول` : `${n} فصل`;
    return res.status(200).json({ success: true, message: `رجع ${what} للرصد في ${subject.name} في ${where}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /marking-skips/:id[?column=key] — undoes the admin's change to a
// column (or to every column of that class, subject and week). One taken
// off is back: the week counts it again, marks already filed under it
// included. One put back is off again, as in every other school.
exports.putBack = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ""))) {
      return res.status(404).json({ success: false, message: "مش موجود." });
    }
    const doc = await MarkingSkip.findById(req.params.id);
    const inScope = doc && (await classesInScope(req, { _id: doc.classroom }))?.length;
    if (!doc || !inScope) return res.status(404).json({ success: false, message: "مش موجود." });

    const column = req.query.column;
    const wasRestored = Boolean(column) && (doc.restored || []).includes(column);
    if (column && !doc.columns.includes(column) && !wasRestored) {
      return res.status(400).json({ success: false, message: "البند ده مش مترفع." });
    }
    const columns = column ? doc.columns.filter((c) => c !== column) : [];
    const restored = column ? (doc.restored || []).filter((c) => c !== column) : [];
    if (columns.length === 0 && restored.length === 0) await doc.deleteOne();
    else {
      doc.columns = columns;
      doc.restored = restored;
      doc.by = req.user._id;
      await doc.save();
    }

    return res.status(200).json({
      success: true,
      message: wasRestored
        ? `«${LABELS[column]}» اتقفل تاني في الفصل ده، زي باقي المدارس.`
        : column
          ? `رجع «${LABELS[column]}» للرصد.`
          : "رجعت البنود زي ما كانت.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
