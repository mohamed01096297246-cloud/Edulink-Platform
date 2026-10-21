const MonthlyGrade = require("../models/MonthlyGrade");
const TermTest = require("../models/TermTest");
const { schemeForClassroom } = require("./gradebook");

// A child's test marks this school year, grouped the way the register lists
// them: on the classic register each calendar month's monthly test
// (MonthlyGrade), on weekly40 the term's two tests (TermTest). Newest group
// first. Only what a teacher has recorded, so a subject whose test isn't in
// yet is simply absent; a subject taught but not marked (Subject.noMarks)
// never shows. Read by the parent's الدرجات and the student's درجاتي.

const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const TERM_NAMES = { 1: "الترم الأول", 2: "الترم الثاني" };
const TEST_NAMES = { 1: "الاختبار الأول", 2: "الاختبار الثاني" };
// Both kinds of test are out of 15 (models/MonthlyGrade, models/TermTest).
const TEST_OUT_OF = 15;

// "2026/2027" → [2026, 2027]. A class without one reads as the school year
// today falls in, which turns in September.
const schoolYears = (academicYear) => {
  const [first, second] = String(academicYear || "").split("/").map(Number);
  if (first) return [first, second || first + 1];
  const now = new Date();
  const start = now.getUTCMonth() + 1 >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return [start, start + 1];
};

// `student.classroom` must be populated with academicYear, grade and school.
const testMarksOf = async (student) => {
  const classroom = student.classroom;
  const scheme = classroom ? await schemeForClassroom(classroom) : "classic";
  const [first, second] = schoolYears(classroom?.academicYear);

  let marks;
  if (scheme === "weekly40") {
    const tests = await TermTest.find({ student: student._id, academicYear: `${first}/${second}` })
      .populate("subject", "name noMarks")
      .select("subject term testNo grade");
    marks = tests.map((t) => ({
      key: `term${t.term}-test${t.testNo}`,
      order: t.term * 10 + t.testNo,
      title: `${TERM_NAMES[t.term]} — ${TEST_NAMES[t.testNo]}`,
      subject: t.subject,
      grade: t.grade,
    }));
  } else {
    const monthly = await MonthlyGrade.find({
      student: student._id,
      $or: [
        { year: first, month: { $gte: 9 } },
        { year: second, month: { $lte: 8 } },
      ],
    })
      .populate("subject", "name noMarks")
      .select("subject month year grade");
    marks = monthly.map((m) => ({
      key: `${m.year}-${m.month}`,
      order: m.year * 100 + m.month,
      title: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
      subject: m.subject,
      grade: m.grade,
    }));
  }

  const groups = new Map();
  marks
    .filter((m) => m.subject && !m.subject.noMarks)
    .forEach((m) => {
      if (!groups.has(m.key)) groups.set(m.key, { key: m.key, title: m.title, order: m.order, subjects: [] });
      groups.get(m.key).subjects.push({
        subjectId: m.subject._id,
        name: m.subject.name,
        grade: m.grade,
        outOf: TEST_OUT_OF,
        percent: Math.round((m.grade / TEST_OUT_OF) * 100),
      });
    });

  return {
    scheme,
    outOf: TEST_OUT_OF,
    groups: [...groups.values()]
      .sort((a, b) => b.order - a.order)
      .map(({ key, title, subjects }) => ({
        key,
        title,
        subjects: subjects.sort((a, b) => a.name.localeCompare(b.name, "ar")),
      })),
  };
};

module.exports = { testMarksOf };
