require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");

// «آخر التطورات» in the teacher app: for a week, each of the teacher's own
// classes with what is recorded and what is left.
test("a teacher sees their own classes for the week, item by item", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const math = await f.subject(s, [g], { name: "رياضيات" });
  const arabic = await f.subject(s, [g], { name: "لغة عربية" });
  const teacher = await f.user("teacher", s, { subjects: [math._id], teachingGrades: [g._id] });
  const other = await f.user("teacher", s, { subjects: [arabic._id], teachingGrades: [g._id] });
  for (const [sub, t, period] of [[math, teacher, 1], [arabic, other, 2]]) {
    await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: t._id, day: "sun", period, startTime: "08:00", endTime: "08:45" });
  }
  const { student: a } = await f.student(c);
  const { student: b } = await f.student(c);
  const t = await f.signIn(teacher);
  const week = "2026-10-04";

  expect((await t.post("/api/weekly-evaluation/bulk", {
    classroomId: String(c._id), weekStart: week,
    gradesList: [{ studentId: String(a._id), score: 8 }, { studentId: String(b._id), score: 9 }],
  })).status).toBe(200);
  expect((await t.post("/api/classwork-notebook/bulk", {
    classroomId: String(c._id), weekStart: week, gradesList: [{ studentId: String(a._id), score: 5 }],
  })).status).toBe(200);

  const res = await t.get(`/api/teacher/progress?date=2026-10-06`);
  expect(res.status).toBe(200);
  expect(res.body.classes).toHaveLength(1);
  const [cls] = res.body.classes;
  expect(cls).toMatchObject({ subject: "رياضيات", subjectId: String(math._id), classroomId: String(c._id), students: 2, status: "partial" });
  const col = Object.fromEntries(cls.columns.map((x) => [x.key, x]));
  expect(col.weekly).toMatchObject({ students: 2, full: true });
  expect(col.classwork).toMatchObject({ students: 1, full: false });
  // The week's homework mark is owed even with no homework posted that week.
  expect(col.homework).toMatchObject({ entered: true, applicable: true, students: 0 });
  expect(res.body.status).toBe("partial");

  // Only teachers reach it.
  expect((await (await f.signIn(other)).get("/api/teacher/progress?date=2026-10-06")).body.classes[0].subject).toBe("لغة عربية");
  const parent = (await f.student(c)).parent;
  expect((await (await f.signIn(parent)).get("/api/teacher/progress")).status).toBe(403);
});
