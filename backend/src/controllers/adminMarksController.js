const mongoose = require("mongoose");
const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const CourseworkOverride = require("../models/CourseworkOverride");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const TermTest = require("../models/TermTest");
const { scopeFilter, sameSchool } = require("../utils/tenant");
const { SCHEMES, schemeForClassroom } = require("../utils/gradebook");
const { computeWeekScores, toWeekStart, maxScoresFor } = require("../utils/weekScores");
const { markedWeeks, termOfDate, hasWeeklyEval } = require("../utils/schoolMonths");
const { rosterWhere } = require("../utils/secondLanguage");
const { ABSENT, isAbsentText, isAbsent, OVERRIDE_FLAG } = require("../utils/absentMark");

// رصد الدرجات من الإدارة: a school's admins type in the same marks its
// teachers record — the week's register and the term's tests — from the web
// panel, to take the load off the teachers. A school has it only when the
// platform owner turns it on (School.features.adminMarks).
//
// Nothing here is a second copy: every mark lands in the very record the
// teacher's own screens read and write, filed under the teacher who has the
// subject in that class, so the teacher sees it as theirs and can change it,
// and whichever of the two saves last is what stands.

const idOf = (value) => String(value?._id || value || "");
const nameOf = (s) => `${s.firstName} ${s.lastName}`.trim();
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), "ar");

// The column each mark is typed into, what it is called on the paper
// register, and the steps it may come in (2 = halves, 4 = quarters) — the
// same steps the teacher's screens allow.
const WEEK_COLUMNS = [
  { key: "homeworkScore", label: "الواجب", steps: 4 },
  { key: "weeklyEvalScore", label: "التقييم الأسبوعي", steps: 2 },
  { key: "classworkScore", label: "كراسة الحصة", steps: 4 },
  { key: "attendanceScore", label: "مواظبة وسلوك", steps: 4 },
];

// The week sheet's columns for a class's scheme — without تقييم أسبوعي in
// a week that has none in any school (utils/schoolMonths.js).
const weekColumnsFor = (scheme, weekStart) => {
  const max = maxScoresFor(scheme);
  return WEEK_COLUMNS.filter(
    (c) => max[c.key] !== undefined && (c.key !== "weeklyEvalScore" || hasWeeklyEval(weekStart)),
  ).map((c) => ({ ...c, max: max[c.key] }));
};

const NO_WEEKLY_EVAL = "الأسبوع ده مالوش تقييم أسبوعي في كل المدارس، فمش محتاج يترصد.";

// Who has a subject in a class: the class assignment first, then the
// timetable — the same order every teacher screen settles it in.
const teacherOf = async (classroomId, subjectId) => {
  const assignment = await ClassAssignment.findOne({ classroom: classroomId, subject: subjectId }).select("teacher");
  if (assignment?.teacher) return assignment.teacher;
  const lesson = await Schedule.findOne({ classroom: classroomId, subject: subjectId, teacher: { $ne: null } }).select("teacher");
  return lesson?.teacher || null;
};

const loadClassroom = async (req, res, classroomId) => {
  if (!mongoose.Types.ObjectId.isValid(String(classroomId || ""))) {
    res.status(400).json({ success: false, message: "اختار الفصل." });
    return null;
  }
  const classroom = await Classroom.findById(classroomId).select("name grade school academicYear");
  if (!classroom || !sameSchool(req, classroom)) {
    res.status(404).json({ success: false, message: "الفصل غير موجود." });
    return null;
  }
  return classroom;
};

// The class, the subject and its teacher, checked together.
const loadSheet = async (req, res, { classroom: classroomId, subject: subjectId }) => {
  const classroom = await loadClassroom(req, res, classroomId);
  if (!classroom) return null;
  if (!mongoose.Types.ObjectId.isValid(String(subjectId || ""))) {
    res.status(400).json({ success: false, message: "اختار المادة." });
    return null;
  }
  const subject = await Subject.findOne({ _id: subjectId, school: classroom.school }).select("name noMarks");
  if (!subject || subject.noMarks) {
    res.status(400).json({ success: false, message: "المادة دي مالهاش درجات في الفصل ده." });
    return null;
  }
  const teacher = await teacherOf(classroom._id, subject._id);
  if (!teacher) {
    res.status(400).json({
      success: false,
      message: "المادة دي مالهاش معلم في الفصل ده — اسندها لمعلم من «إسناد الفصول» الأول.",
    });
    return null;
  }
  const scheme = await schemeForClassroom(classroom);
  return { classroom, subject, teacher, scheme };
};

// The pupils on the sheet, in the order of the paper register.
const rosterOf = async (classroom, subjectId) =>
  (
    await Student.find({
      classroom: classroom._id,
      active: true,
      ...(await rosterWhere(classroom._id, subjectId)),
    }).select("firstName lastName")
  ).sort(byName);

// A typed mark: a number in the column's range and steps, «غ» (absent — a
// 0 that reads غ, utils/absentMark.js), or null (clear it).
const markOf = (value, max, steps) => {
  if (value === null || value === "") return { value: null };
  if (isAbsentText(value)) return { value: 0, absent: true };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || !Number.isInteger(Math.round(n * steps * 1e6) / 1e6)) {
    return { error: true };
  }
  return { value: n, absent: false };
};

// The update for a mark kept in a document of its own (التقييم الأسبوعي،
// كراسة الحصة، a term test): the number, and the غ flag set or taken off.
const markUpdate = (field, mark, owner) => ({
  $set: { [field]: mark.value, ...owner, ...(mark.absent ? { absent: true } : {}) },
  ...(mark.absent ? {} : { $unset: { absent: "" } }),
});

// How the sheet shows a stored mark: the number, or غ.
const shownMark = (value, absent) => (absent ? ABSENT : value ?? null);

// GET /admin-marks/options — the classes the admin may record for, each
// with its subjects that carry marks and their teacher; the weeks so far;
// and the current term.
exports.getOptions = async (req, res) => {
  try {
    const filter = scopeFilter(req, {}, "grade");
    if (!filter) return res.status(400).json({ success: false, message: "Please specify a school (?school=id)." });

    const classrooms = await Classroom.find(filter).populate("grade", "name").select("name grade school").lean();
    const ids = classrooms.map((c) => c._id);
    const [assignments, lessons] = await Promise.all([
      ClassAssignment.find({ classroom: { $in: ids } })
        .populate("subject", "name noMarks")
        .populate("teacher", "firstName lastName")
        .lean(),
      Schedule.find({ classroom: { $in: ids }, teacher: { $ne: null } })
        .populate("subject", "name noMarks")
        .populate("teacher", "firstName lastName")
        .lean(),
    ]);

    // One teacher per class and subject — the assignment wins, as above.
    const subjectsOf = new Map();
    for (const row of [...assignments, ...lessons]) {
      if (!row.subject || row.subject.noMarks || !row.teacher) continue;
      const classKey = String(row.classroom);
      if (!subjectsOf.has(classKey)) subjectsOf.set(classKey, new Map());
      const subjects = subjectsOf.get(classKey);
      if (!subjects.has(String(row.subject._id))) {
        subjects.set(String(row.subject._id), {
          _id: row.subject._id,
          name: row.subject.name,
          teacher: `${row.teacher.firstName} ${row.teacher.lastName}`,
        });
      }
    }

    const out = [];
    for (const c of classrooms) {
      // eslint-disable-next-line no-await-in-loop -- a school's classes, a handful of reads.
      const scheme = await schemeForClassroom(c);
      out.push({
        _id: c._id,
        name: c.name,
        grade: c.grade ? { _id: c.grade._id, name: c.grade.name } : null,
        scheme,
        terms: Boolean(SCHEMES[scheme]?.termTests),
        subjects: [...(subjectsOf.get(String(c._id))?.values() || [])].sort((a, b) => a.name.localeCompare(b.name, "ar")),
      });
    }
    out.sort(
      (a, b) =>
        String(a.grade?.name || "").localeCompare(String(b.grade?.name || ""), "ar") ||
        String(a.name).localeCompare(String(b.name), "ar"),
    );

    const today = new Date();
    return res.status(200).json({
      success: true,
      data: {
        classes: out,
        weeks: markedWeeks(today).map((w) => ({
          weekStart: w.weekStart.toISOString().slice(0, 10),
          label: w.label,
          from: w.from.toISOString().slice(0, 10),
          to: w.to.toISOString().slice(0, 10),
        })),
        term: termOfDate(today),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /admin-marks/week?classroom&subject&weekStart — the week's register
// for one class and subject, every column as the teacher's screen shows it.
exports.getWeek = async (req, res) => {
  try {
    const weekStart = toWeekStart(req.query.weekStart);
    if (!weekStart) return res.status(400).json({ success: false, message: "اختار الأسبوع." });
    const sheet = await loadSheet(req, res, req.query);
    if (!sheet) return undefined;

    const students = await rosterOf(sheet.classroom, sheet.subject._id);
    const scores = await computeWeekScores(
      sheet.classroom._id,
      sheet.subject._id,
      students.map((s) => s._id),
      weekStart,
      sheet.scheme,
    );
    const columns = weekColumnsFor(sheet.scheme, weekStart).map(({ key, label, max }) => ({ key, label, max }));

    return res.status(200).json({
      success: true,
      data: {
        columns,
        total: columns.reduce((sum, c) => sum + c.max, 0) || null,
        note: hasWeeklyEval(weekStart) ? null : NO_WEEKLY_EVAL,
        students: students.map((s) => {
          const score = scores[String(s._id)] || {};
          return {
            _id: s._id,
            name: nameOf(s),
            marks: Object.fromEntries(columns.map((c) => [c.key, shownMark(score[c.key], score.absent?.[c.key])])),
          };
        }),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /admin-marks/week — { classroom, subject, weekStart, list: [{ student,
// marks: { column: value | "غ" | null } }] }. Only the columns sent are
// touched; null clears one (الواجب and مواظبة go back to what the register
// works out).
exports.saveWeek = async (req, res) => {
  try {
    const weekStart = toWeekStart(req.body.weekStart);
    if (!weekStart) return res.status(400).json({ success: false, message: "اختار الأسبوع." });
    const list = Array.isArray(req.body.list) ? req.body.list : [];
    if (list.length === 0) return res.status(400).json({ success: false, message: "مفيش درجات اتغيّرت." });

    const sheet = await loadSheet(req, res, req.body);
    if (!sheet) return undefined;
    const max = maxScoresFor(sheet.scheme);
    const columns = weekColumnsFor(sheet.scheme, weekStart);
    const onSheet = new Set((await rosterOf(sheet.classroom, sheet.subject._id)).map((s) => String(s._id)));

    const overrides = [];
    const evaluations = [];
    const notebooks = [];
    for (const item of list) {
      const studentId = idOf(item?.student);
      if (!onSheet.has(studentId)) {
        return res.status(400).json({ success: false, message: "فيه طالب مش في الفصل ده." });
      }
      const marks = item.marks || {};
      const set = {};
      const unset = {};
      for (const key of Object.keys(marks)) {
        const column = columns.find((c) => c.key === key);
        if (!column) {
          return res.status(400).json({
            success: false,
            message: key === "weeklyEvalScore" ? NO_WEEKLY_EVAL : "العمود ده مش في كشف الفصل ده.",
          });
        }
        const mark = markOf(marks[key], max[key], column.steps);
        if (mark.error) {
          return res.status(400).json({
            success: false,
            message: `درجة «${column.label}» لازم تكون من 0 لـ ${max[key]}، أو «غ» للغايب.`,
          });
        }
        const at = { student: studentId, subject: sheet.subject._id, weekStart };
        const owner = { classroom: sheet.classroom._id, teacher: sheet.teacher, school: sheet.classroom.school };
        if (key === "weeklyEvalScore") {
          evaluations.push(
            mark.value === null
              ? { deleteOne: { filter: at } }
              : { updateOne: { filter: at, update: markUpdate("score", mark, owner), upsert: true } },
          );
        } else if (key === "classworkScore") {
          notebooks.push(
            mark.value === null
              ? { deleteOne: { filter: at } }
              : { updateOne: { filter: at, update: markUpdate("score", mark, owner), upsert: true } },
          );
        } else if (mark.value === null) {
          unset[key] = "";
          unset[OVERRIDE_FLAG[key]] = "";
        } else {
          set[key] = mark.value;
          if (mark.absent) set[OVERRIDE_FLAG[key]] = true;
          else unset[OVERRIDE_FLAG[key]] = "";
        }
      }
      if (Object.keys(set).length || Object.keys(unset).length) {
        const at = { student: studentId, subject: sheet.subject._id, weekStart };
        const update = {
          $set: { ...set, classroom: sheet.classroom._id, teacher: sheet.teacher, school: sheet.classroom.school },
        };
        if (Object.keys(unset).length) update.$unset = unset;
        overrides.push({ updateOne: { filter: at, update, upsert: true } });
      }
    }

    if (overrides.length) await CourseworkOverride.bulkWrite(overrides);
    if (evaluations.length) await WeeklyEvaluation.bulkWrite(evaluations);
    if (notebooks.length) await ClassworkNotebook.bulkWrite(notebooks);

    return res.status(200).json({
      success: true,
      message: list.length === 1 ? "اتحفظت درجات الطالب." : `اتحفظت درجات ${list.length} طالب.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const termOfRequest = (source) => {
  const term = Number(source.term);
  const testNo = Number(source.testNo);
  return [1, 2].includes(term) && [1, 2].includes(testNo) ? { term, testNo } : null;
};

// GET /admin-marks/test?classroom&subject&term&testNo — one of the term's
// two tests (the weekly40 register's), out of 15.
exports.getTest = async (req, res) => {
  try {
    const which = termOfRequest(req.query);
    if (!which) return res.status(400).json({ success: false, message: "اختار الاختبار." });
    const sheet = await loadSheet(req, res, req.query);
    if (!sheet) return undefined;
    const rules = SCHEMES[sheet.scheme];
    if (!rules?.termTests) {
      return res.status(400).json({ success: false, message: "الفصل ده مافيهوش اختبارات ترم." });
    }

    const students = await rosterOf(sheet.classroom, sheet.subject._id);
    const tests = await TermTest.find({
      subject: sheet.subject._id,
      academicYear: sheet.classroom.academicYear,
      term: which.term,
      testNo: which.testNo,
      student: { $in: students.map((s) => s._id) },
    }).select("student grade absent");
    const gradeOf = new Map(tests.map((t) => [String(t.student), shownMark(t.grade, isAbsent(t.absent, t.grade))]));

    return res.status(200).json({
      success: true,
      data: {
        columns: [{ key: "grade", label: "درجة الاختبار", max: rules.termTestMax }],
        total: null,
        students: students.map((s) => ({
          _id: s._id,
          name: nameOf(s),
          marks: { grade: gradeOf.has(String(s._id)) ? gradeOf.get(String(s._id)) : null },
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /admin-marks/test — { classroom, subject, term, testNo, list: [{
// student, marks: { grade: value | "غ" | null } }] }.
exports.saveTest = async (req, res) => {
  try {
    const which = termOfRequest(req.body);
    if (!which) return res.status(400).json({ success: false, message: "اختار الاختبار." });
    const list = Array.isArray(req.body.list) ? req.body.list : [];
    if (list.length === 0) return res.status(400).json({ success: false, message: "مفيش درجات اتغيّرت." });

    const sheet = await loadSheet(req, res, req.body);
    if (!sheet) return undefined;
    const rules = SCHEMES[sheet.scheme];
    if (!rules?.termTests) {
      return res.status(400).json({ success: false, message: "الفصل ده مافيهوش اختبارات ترم." });
    }
    const onSheet = new Set((await rosterOf(sheet.classroom, sheet.subject._id)).map((s) => String(s._id)));

    const ops = [];
    for (const item of list) {
      const studentId = idOf(item?.student);
      if (!onSheet.has(studentId)) {
        return res.status(400).json({ success: false, message: "فيه طالب مش في الفصل ده." });
      }
      const mark = markOf(item.marks?.grade, rules.termTestMax, 2);
      if (mark.error) {
        return res.status(400).json({
          success: false,
          message: `درجة الاختبار لازم تكون من 0 لـ ${rules.termTestMax}، أو «غ» للغايب.`,
        });
      }
      const at = {
        student: studentId,
        subject: sheet.subject._id,
        academicYear: sheet.classroom.academicYear,
        term: which.term,
        testNo: which.testNo,
      };
      ops.push(
        mark.value === null
          ? { deleteOne: { filter: at } }
          : {
              updateOne: {
                filter: at,
                update: markUpdate("grade", mark, {
                  classroom: sheet.classroom._id,
                  teacher: sheet.teacher,
                  school: sheet.classroom.school,
                }),
                upsert: true,
              },
            },
      );
    }
    await TermTest.bulkWrite(ops);

    return res.status(200).json({
      success: true,
      message: list.length === 1 ? "اتحفظت درجة الطالب." : `اتحفظت درجات ${list.length} طالب.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
