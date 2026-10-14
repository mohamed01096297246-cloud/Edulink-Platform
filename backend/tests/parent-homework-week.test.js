require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");

// درجة الواجب in the parent app: the week's الواجب mark the teacher gave, in
// every subject the child takes.
const setUp = async () => {
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
  const { student, parent } = await f.student(c);
  return { s, g, c, teacher, student, parent };
};

test("the week's homework mark shows per subject, unmarked ones empty", async () => {
  const { c, teacher, student, parent } = await setUp();
  const week = "2026-10-04";
  const saved = await (await f.signIn(teacher)).post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: week,
    list: [{ studentId: String(student._id), homeworkScore: 4 }],
  });
  expect(saved.status).toBe(200);

  const p = await f.signIn(parent);
  // A Tuesday of the same week lands on the same week.
  const res = await p.get(`/api/parent/homework-week/${student._id}?weekStart=2026-10-06`);
  expect(res.status).toBe(200);
  const { data } = res.body;
  expect(data.weekStart).toBe(week);
  expect(data.max).toBe(5);
  const byName = Object.fromEntries(data.subjects.map((x) => [x.name, x]));
  expect(byName["رياضيات"]).toMatchObject({ score: 4, max: 5 });
  expect(byName["لغة عربية"]).toMatchObject({ score: null });

  // With no week asked for, it opens on the latest marked week.
  expect((await p.get(`/api/parent/homework-week/${student._id}`)).body.data.weekStart).toBe(week);
});

test("a parent can't read another family's child's homework marks", async () => {
  const { s, student } = await setUp();
  const stranger = await f.user("parent", s);
  const res = await (await f.signIn(stranger)).get(`/api/parent/homework-week/${student._id}`);
  expect(res.status).toBe(403);
});
