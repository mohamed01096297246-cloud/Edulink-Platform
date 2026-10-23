const Schedule = require("../models/Schedule");

// «مادة ثانية»: a class period split between languages taught at the same
// time — French and German, say — each pupil sitting the one on their record
// (Student.secondLanguage). On the timetable it is one row per language,
// every row flagged `secondLanguage` (models/Schedule.js).
//
// Which subjects a class takes this way is read off its timetable, so a
// class without such a period is untouched by all of this, whatever its
// pupils' records say. Within one that has it, a pupil whose language hasn't
// been set yet stays on every language's list until the school sets it.

const idOf = (value) => String(value?._id || value || "");

// The subjects a class takes as its second language, as a Set of ids.
const electivesOf = async (classroomId) => {
  if (!classroomId) return new Set();
  const ids = await Schedule.distinct("subject", { classroom: classroomId, secondLanguage: true });
  return new Set(ids.map(String));
};

// The same for many classes at once: classroom id → Set of subject ids.
const electivesByClass = async (classroomIds) => {
  const map = new Map();
  if (!classroomIds?.length) return map;
  const rows = await Schedule.find({ classroom: { $in: classroomIds }, secondLanguage: true })
    .select("classroom subject")
    .lean();
  for (const row of rows) {
    const key = String(row.classroom);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(row.subject));
  }
  return map;
};

// Whether a pupil takes a subject, given their class's second languages.
const takes = (student, subjectId, electives) => {
  if (!subjectId || !electives?.has(idOf(subjectId))) return true;
  return !student?.secondLanguage || idOf(student.secondLanguage) === idOf(subjectId);
};

// Added to a Student query listing a class's pupils for one subject: when
// the subject is one of the class's second languages, only the pupils taking
// it (or not yet given one). Empty otherwise — the whole class takes it.
const rosterWhere = async (classroomId, subjectId) => {
  if (!classroomId || !subjectId) return {};
  const electives = await electivesOf(classroomId);
  if (!electives.has(idOf(subjectId))) return {};
  return { secondLanguage: { $in: [idOf(subjectId), null] } };
};

// The subjects in `subjectIds` this pupil takes — the other languages of
// their class's «مادة ثانية» left out.
const subjectsTakenBy = async (student, subjectIds) => {
  const electives = await electivesOf(student?.classroom?._id || student?.classroom);
  return subjectIds.filter((id) => takes(student, id, electives));
};

// The second languages of the pupil's class that aren't the pupil's — what
// a class-wide list they read (homework, board notes) leaves out. Empty when
// they have no language yet: they see every language's until then.
const otherLanguagesFor = async (student) => {
  if (!student?.secondLanguage) return [];
  const electives = await electivesOf(student.classroom?._id || student.classroom);
  return [...electives].filter((id) => id !== idOf(student.secondLanguage));
};

// The language a teacher teaches a class in its «مادة ثانية», for screens
// that name only the class: when every lesson the teacher has there is one
// language's second-language row. Null when they teach it anything else
// too (or nothing) — the screen can't tell which lesson it is for then, and
// shows the whole class as it always has.
const teacherLanguageIn = async (teacherId, classroomId) => {
  if (!teacherId || !classroomId) return null;
  const lessons = await Schedule.find({ teacher: teacherId, classroom: classroomId })
    .select("subject secondLanguage")
    .lean();
  if (!lessons.length || !lessons.every((l) => l.secondLanguage)) return null;
  const subjects = new Set(lessons.map((l) => String(l.subject)));
  return subjects.size === 1 ? [...subjects][0] : null;
};

// A Student filter for the pupils a teacher teaches across some classes:
// each class whole, except one the teacher takes only for a «مادة ثانية»
// language, where it is that language's pupils (and those without one yet).
const taughtByWhere = async (teacherId, classroomIds) => {
  const parts = await Promise.all(
    (classroomIds || []).map(async (classroomId) => {
      const language = await teacherLanguageIn(teacherId, classroomId);
      return language
        ? { classroom: classroomId, secondLanguage: { $in: [language, null] } }
        : { classroom: classroomId };
    }),
  );
  return parts.length ? { $or: parts } : { classroom: { $in: [] } };
};

// The name a «مادة ثانية» period goes by before a pupil has a language.
const SECOND_LANGUAGE_NAME = "مادة ثانية";

// A class's lessons as one pupil sees them: each «مادة ثانية» period becomes
// the pupil's own language with its teacher — or, when the pupil has none
// yet (or the period doesn't offer theirs), the period once, named «مادة
// ثانية», with no teacher. Every other lesson passes through untouched.
// Works on documents or plain objects; a stand-in row is a plain object.
const asTakenBy = (lessons, student) => {
  const language = student?.secondLanguage ? idOf(student.secondLanguage) : "";
  const slots = new Map();
  for (const lesson of lessons) {
    if (!lesson.secondLanguage) continue;
    const key = `${lesson.day}|${lesson.period}|${lesson.startTime}`;
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(lesson);
  }

  const out = [];
  const done = new Set();
  for (const lesson of lessons) {
    if (!lesson.secondLanguage) {
      out.push(lesson);
      continue;
    }
    const key = `${lesson.day}|${lesson.period}|${lesson.startTime}`;
    if (done.has(key)) continue;
    done.add(key);
    const mine = language && slots.get(key).find((row) => idOf(row.subject) === language);
    if (mine) {
      out.push(mine);
      continue;
    }
    const plain = typeof lesson.toObject === "function" ? lesson.toObject() : { ...lesson };
    out.push({ ...plain, subject: { _id: null, name: SECOND_LANGUAGE_NAME }, teacher: null });
  }
  return out;
};

module.exports = {
  SECOND_LANGUAGE_NAME,
  electivesOf,
  electivesByClass,
  takes,
  rosterWhere,
  subjectsTakenBy,
  otherLanguagesFor,
  teacherLanguageIn,
  taughtByWhere,
  asTakenBy,
};
