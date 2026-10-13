require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");

// تقييم الأسبوع in the parent app: every subject the child takes, with the
// week's التقييم الأسبوعي mark as a percentage of what it is out of.
const setUp = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const math = await f.subject(s, [g], { name: "رياضيات" });
  const arabic = await f.subject(s, [g], { name: "لغة عربية" });
  const teacher = await f.user("teacher", s, { subjects: [math._id, arabic._id], teachingGrades: [g._id] });
  for (const [sub, period] of [[math, 1], [arabic, 2]]) {
    await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period, startTime: "08:00", endTime: "08:45" });
  }
  const { student, parent } = await f.student(c);
  return { s, g, c, math, arabic, teacher, student, parent };
};

test("the week's evaluation shows each subject as a percentage, unmarked ones empty", async () => {
  const { c, math, teacher, student, parent } = await setUp();
  const week = "2026-10-04";
  const saved = await (await f.signIn(teacher)).post("/api/weekly-evaluation/bulk", {
    classroomId: String(c._id),
    weekStart: week,
    subjectId: String(math._id),
    gradesList: [{ studentId: String(student._id), score: 7.5 }],
  });
  expect(saved.status).toBe(200);

  const p = await f.signIn(parent);
  // A Tuesday of the same week lands on the same week.
  const res = await p.get(`/api/parent/week-evaluation/${student._id}?weekStart=2026-10-06`);
  expect(res.status).toBe(200);
  const { data } = res.body;
  expect(data.weekStart).toBe(week);
  expect(data.max).toBe(10);
  const byName = Object.fromEntries(data.subjects.map((x) => [x.name, x]));
  expect(byName["رياضيات"]).toMatchObject({ score: 7.5, percent: 75 });
  expect(byName["لغة عربية"]).toMatchObject({ score: null, percent: null });
  expect(data.overall).toBe(75);

  // With no week asked for, it opens on the latest marked week.
  expect((await p.get(`/api/parent/week-evaluation/${student._id}`)).body.data.weekStart).toBe(week);
});

test("a parent can't read another family's child", async () => {
  const { s, student } = await setUp();
  const stranger = await f.user("parent", s);
  const res = await (await f.signIn(stranger)).get(`/api/parent/week-evaluation/${student._id}`);
  expect(res.status).toBe(403);
});
