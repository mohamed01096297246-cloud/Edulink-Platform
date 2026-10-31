const Subject = require("../models/Subject");
const Student = require("../models/Student");
const { notifyStudents } = require("./notify");
const { rosterWhere } = require("./secondLanguage");

// What a teacher does reaches the student as a notification (Mohamed,
// 2026-10-31): a mark of theirs recorded or changed, an absence recorded, a
// homework changed. New homework, its mark, board notes, praise and the
// teacher's own notices already did (utils/notify.js). Every function here
// is called after the save has gone through and never throws — a notice
// that fails must not fail the save. Only students reach here, not parents.

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const fmt = (n) => String(Math.round(Number(n) * 100) / 100);

// "أسبوع 25 أكتوبر", as the student's «أدائي» names the week.
const weekName = (weekStart) => {
  const d = new Date(weekStart);
  return `أسبوع ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// "الأحد 25 أكتوبر" — records are dated at midnight UTC on the school day.
const dayName = (date) => {
  const d = new Date(date);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const subjectName = async (subjectId) =>
  subjectId ? (await Subject.findById(subjectId).select("name").lean())?.name || "" : "";

// What each student had before a save, by student id: `docs` the records
// read just before it, `pick` the columns of one record.
const marksBefore = (docs, pick) => new Map(docs.map((d) => [String(d.student), pick(d)]));

// A save of marks: `columns` { key: { label, max } }; `before` from
// marksBefore; `after` [{ studentId, marks: { key: value } }]. A mark saved
// back as it was, or put back to automatic (null), says nothing; one new or
// different does — "درجة جديدة في English / أسبوع 25 أكتوبر — التقييم
// الأسبوعي: 18 من 20".
const tellMarks = async ({ subjectId, when, columns, before, after, createdBy, school }) => {
  try {
    const items = [];
    after.forEach(({ studentId, marks }) => {
      const had = before.get(String(studentId)) || {};
      const parts = [];
      let changed = false;
      Object.entries(marks || {}).forEach(([key, value]) => {
        if (!columns[key] || value === null || value === undefined || value === "") return;
        if (!Number.isFinite(Number(value))) return;
        const previous = had[key];
        const hadOne = previous !== null && previous !== undefined;
        if (hadOne && Number(previous) === Number(value)) return;
        if (hadOne) changed = true;
        parts.push(`${columns[key].label}: ${fmt(value)} من ${columns[key].max}`);
      });
      if (parts.length) items.push({ studentId, changed, parts });
    });
    if (!items.length) return;

    const name = await subjectName(subjectId);
    await notifyStudents({
      type: "grade",
      createdBy,
      school,
      items: items.map((i) => ({
        studentId: i.studentId,
        title: i.changed ? `اتعدّلت درجتك في ${name}` : `درجة جديدة في ${name}`,
        message: `${when} — ${i.parts.join(" · ")}`,
      })),
    });
  } catch (err) {
    console.log("tellMarks error:", err.message);
  }
};

// Students recorded absent: "اتسجّل غيابك — الأحد 25 أكتوبر، حصة English".
// `subjectId` is left out on the daily register, where the absence is the
// day's.
const tellAbsences = async ({ studentIds, date, subjectId, daily = false, createdBy, school }) => {
  try {
    if (!studentIds.length) return;
    const name = daily ? "" : await subjectName(subjectId);
    const message = `اتسجّل غيابك يوم ${dayName(date)}${name ? `، حصة ${name}` : ""}. لو كنت حاضر كلّم معلمك.`;
    await notifyStudents({
      type: "attendance",
      createdBy,
      school,
      items: studentIds.map((studentId) => ({ studentId, title: "اتسجّل غيابك", message })),
    });
  } catch (err) {
    console.log("tellAbsences error:", err.message);
  }
};

// A homework the teacher changed: every pupil of the class it was set to —
// in a «مادة ثانية», only those taking it.
const tellHomeworkChanged = async ({ homework, createdBy, school }) => {
  try {
    const classroom = homework.classroom?._id || homework.classroom;
    const students = await Student.find({
      classroom,
      active: true,
      ...(await rosterWhere(classroom, homework.subject?._id || homework.subject)),
    })
      .select("_id")
      .lean();
    const name = homework.subject?.name || (await subjectName(homework.subject));
    await notifyStudents({
      type: "homework",
      createdBy,
      school,
      items: students.map((s) => ({
        studentId: s._id,
        title: `اتعدّل واجب ${name}`,
        message: `${homework.title}${homework.pageNumber ? ` · ${homework.pageNumber}` : ""}`,
      })),
    });
  } catch (err) {
    console.log("tellHomeworkChanged error:", err.message);
  }
};

module.exports = { weekName, marksBefore, tellMarks, tellAbsences, tellHomeworkChanged };
