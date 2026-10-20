require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");

// اختبار الشهر (classic) and the weekly40 term tests take whole marks or a
// half — 14.5 — and nothing finer.
const setUp = async ({ weekly40 = false } = {}) => {
  const s = await f.school(weekly40 ? { gradebook: { preparatory: "weekly40" } } : {});
  const g = await f.grade(s, weekly40 ? { stage: "preparatory" } : {});
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  return { c, student, t: await f.signIn(teacher) };
};

test("the monthly test takes a half mark", async () => {
  const { c, student, t } = await setUp();
  const save = (grade) =>
    t.post("/api/monthly-grades/bulk", { classroomId: String(c._id), month: 10, gradesList: [{ studentId: String(student._id), grade }] });

  expect((await save(14.3)).status).toBe(400);
  expect((await save(15.5)).status).toBe(400);
  const bad = await save(14.25);
  expect(bad.status).toBe(400);
  expect(bad.body.message).toContain("نص درجة");
  expect((await save(14.5)).status).toBe(200);

  const res = await t.get(`/api/monthly-grades/classroom/${c._id}?month=10`);
  expect(res.body.data.grades[String(student._id)]).toBe(14.5);
});

test("a weekly40 term test takes a half mark", async () => {
  const { c, student, t } = await setUp({ weekly40: true });
  const save = (grade) =>
    t.post("/api/term-tests/bulk", { classroomId: String(c._id), term: 1, testNo: 1, gradesList: [{ studentId: String(student._id), grade }] });

  expect((await save(12.25)).status).toBe(400);
  expect((await save(12.5)).status).toBe(200);

  const res = await t.get(`/api/term-tests/classroom/${c._id}?term=1&testNo=1`);
  expect(res.body.data.grades[String(student._id)]).toBe(12.5);
});
