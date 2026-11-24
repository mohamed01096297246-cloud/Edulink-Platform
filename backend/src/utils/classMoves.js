const mongoose = require("mongoose");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");
const MonthlyGrade = require("../models/MonthlyGrade");
const TermTest = require("../models/TermTest");

// A pupil moved to another class of the same grade takes their marks along
// (Mohamed, 2026-11-24: «طلاب تم نقلهم من فصل لفصل المفروض يتنقلوا
// بدرجاتهم»). Every mark is filed under the class it was recorded in
// (`classroom`), and the registers, averages and reports read a class's marks
// by it — so moving the pupil alone left their marks behind, out of sight of
// the new class's teacher, the pupil's parents and the reports.
//
// A mark only joins a week, or a test, that the new class has recorded
// itself. A week is on a class's register as soon as anything is filed in it
// (utils/weekScores.recordedWeeks), and every pupil with nothing there gets 0
// for it — so a week the new class hasn't reached yet, brought in by one
// pupil, would cost the whole class. Such a mark waits where it is, and joins
// as soon as the new class records that week or test (joinWaiting): when its
// teacher saves it, or an admin does.
//
// The mark keeps its teacher, who is who entered it, and its updatedAt, which
// the grade-entry report reads as when it was entered.
const KINDS = {
  week: {
    models: [WeeklyEvaluation, ClassworkNotebook, CourseworkOverride],
    fields: ["subject", "weekStart"],
  },
  month: { models: [MonthlyGrade], fields: ["subject", "month", "year"] },
  term: { models: [TermTest], fields: ["subject", "academicYear", "term", "testNo"] },
};

const toId = (id) => new mongoose.Types.ObjectId(String(id));
const keyOf = (fields, doc) =>
  fields.map((f) => (doc[f] instanceof Date ? doc[f].getTime() : String(doc[f]))).join("|");

// The weeks (or tests) a class has anything recorded in, among `subjects`.
const recordedIn = async (kind, classroomId, subjects) => {
  const { models, fields } = KINDS[kind];
  const seen = new Set();
  for (const Model of models) {
    // eslint-disable-next-line no-await-in-loop -- one to three collections.
    const rows = await Model.aggregate([
      { $match: { classroom: toId(classroomId), subject: { $in: subjects.map(toId) } } },
      { $group: { _id: Object.fromEntries(fields.map((f) => [f, `$${f}`])) } },
    ]);
    rows.forEach((r) => seen.add(keyOf(fields, r._id)));
  }
  return seen;
};

// Moves one pupil's marks from `fromId` to `toId`, both classes of the same
// grade. Returns how many moved, and how many wait for a week or test the new
// class hasn't recorded yet.
const moveMarks = async (studentId, fromId, toClassId) => {
  let moved = 0;
  let waiting = 0;
  for (const kind of Object.keys(KINDS)) {
    const { models, fields } = KINDS[kind];
    // eslint-disable-next-line no-await-in-loop
    const docs = await Promise.all(
      models.map((Model) => Model.find({ student: studentId, classroom: fromId }).select(fields.join(" ")).lean()),
    );
    const subjects = [...new Set(docs.flat().map((d) => String(d.subject)))];
    if (subjects.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const recorded = await recordedIn(kind, toClassId, subjects);
    for (let i = 0; i < models.length; i += 1) {
      const joining = docs[i].filter((d) => recorded.has(keyOf(fields, d))).map((d) => d._id);
      waiting += docs[i].length - joining.length;
      if (joining.length === 0) continue;
      // eslint-disable-next-line no-await-in-loop
      const res = await models[i].updateMany(
        { _id: { $in: joining } },
        { $set: { classroom: toClassId } },
        { timestamps: false },
      );
      moved += res.modifiedCount;
    }
  }
  return { moved, waiting };
};

// After a class records a week or a test (`at`: the subject and the week, the
// month or the test), the marks its pupils brought from their old class for
// it, waiting there, join it. Only from classes of the same grade, and only
// once the class has something of its own in it — a save that only cleared
// marks leaves the week unrecorded, and nothing joins.
const joinWaiting = async (classroomId, kind, at) => {
  const { models } = KINDS[kind];
  const room = await Classroom.findById(classroomId).select("grade").lean();
  if (!room) return 0;
  const own = await Promise.all(models.map((Model) => Model.exists({ classroom: room._id, ...at })));
  if (!own.some(Boolean)) return 0;
  const [pupils, sameGrade] = await Promise.all([
    Student.find({ classroom: room._id }).distinct("_id"),
    Classroom.find({ grade: room.grade, _id: { $ne: room._id } }).distinct("_id"),
  ]);
  if (pupils.length === 0 || sameGrade.length === 0) return 0;
  let joined = 0;
  for (const Model of models) {
    // eslint-disable-next-line no-await-in-loop
    const res = await Model.updateMany(
      { student: { $in: pupils }, classroom: { $in: sameGrade }, ...at },
      { $set: { classroom: room._id } },
      { timestamps: false },
    );
    joined += res.modifiedCount;
  }
  return joined;
};

// The ids among `ids` of pupils in the class now. A teacher's screen can
// still hold a pupil who has moved out — an id from it is dropped, never
// filed under this class, which would pull the pupil's mark back out of the
// class they're in now.
const inClass = async (classroomId, ids) => {
  const valid = ids.filter((id) => mongoose.isValidObjectId(id)).map(String);
  if (valid.length === 0) return new Set();
  return new Set(
    (await Student.find({ _id: { $in: valid }, classroom: classroomId }).distinct("_id")).map(String),
  );
};

// A save in which no pupil is in the class any more.
const NOT_IN_CLASS = "الطلاب دول مش في الفصل ده دلوقتي — حدّث الصفحة وارصد تاني.";

// What the admin is told when a pupil moves, after the class's save.
const movedNotice = ({ moved, waiting }, className) => {
  if (moved === 0 && waiting === 0) return null;
  const parts = [];
  if (moved > 0) parts.push(`اتنقلت درجات الطالب معاه لفصل ${className} (${moved} درجة).`);
  if (waiting > 0) {
    parts.push(
      `${waiting} درجة في أسابيع أو اختبارات لسه فصل ${className} مارصدهاش، وهتنضم له أول ما مدرس المادة يرصدها.`,
    );
  }
  return parts.join(" ");
};

module.exports = { moveMarks, joinWaiting, inClass, movedNotice, NOT_IN_CLASS, KINDS };
