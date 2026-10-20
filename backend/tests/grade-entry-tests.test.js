require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");

// رصد الدرجات ← «اختبار الشهر»: for a month, which teachers recorded the
// month's test for their classes — on weekly40, the term's two tests.
const lesson = (s, c, sub, t, period) =>
  Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: t._id, day: "sun", period, startTime: "08:00", endTime: "08:45" });

test("the admin sees who recorded the month's test, class by class", async () => {
  const s = await f.school();
  const g = await f.grade(s, { stage: "primary" });
  const c = await f.classroom(g, { name: "4/1" });
  const [arabic, math, science] = await Promise.all(["عربي", "رياضيات", "علوم"].map((name) => f.subject(s, [g], { name })));
  const all = await f.user("teacher", s, { firstName: "أ. كاملة", subjects: [arabic._id], teachingGrades: [g._id] });
  const half = await f.user("teacher", s, { firstName: "أ. نص", subjects: [math._id], teachingGrades: [g._id] });
  const none = await f.user("teacher", s, { firstName: "أ. لسه", subjects: [science._id], teachingGrades: [g._id] });
  await lesson(s, c, arabic, all, 1);
  await lesson(s, c, math, half, 2);
  await lesson(s, c, science, none, 3);
  const { student: a } = await f.student(c);
  const { student: b } = await f.student(c);

  const monthly = async (teacher, students, month) => {
    const res = await (await f.signIn(teacher)).post("/api/monthly-grades/bulk", {
      classroomId: String(c._id),
      month,
      gradesList: students.map((st) => ({ studentId: String(st._id), grade: 14.5 })),
    });
    expect(res.status).toBe(200);
  };
  await monthly(all, [a, b], 10);
  await monthly(half, [a], 10);
  // September's test doesn't count for October.
  await monthly(none, [a, b], 9);

  const admin = await f.signIn(await f.user("admin", s));
  const res = await admin.get("/api/analytics/grade-entry?kind=tests&date=2026-10-15");
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ kind: "tests", period: "month", month: 10, year: 2026 });
  expect(res.body.summary).toMatchObject({ teachers: 3, complete: 1, partial: 1, none: 1 });
  const cell = (name) => res.body.teachers.find((t) => t.name.startsWith(name)).classes[0];
  expect(cell("أ. كاملة").columns).toEqual([expect.objectContaining({ key: "monthly", label: "اختبار الشهر", max: 15, students: 2, full: true })]);
  expect(cell("أ. نص")).toMatchObject({ status: "partial", columns: [expect.objectContaining({ students: 1, full: false })] });
  expect(cell("أ. لسه")).toMatchObject({ status: "none", columns: [expect.objectContaining({ students: 0 })] });

  // The weeks' view is unchanged by it.
  const weekly = await admin.get("/api/analytics/grade-entry?period=week&date=2026-10-15");
  expect(weekly.body.kind).toBe("weeks");
  expect(weekly.body.teachers[0].classes[0].columns.map((col) => col.key)).toEqual(["attendance", "homework", "weekly", "classwork"]);
});

test("on weekly40 the tests view shows the term's two tests", async () => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await lesson(s, c, sub, teacher, 1);
  const { student } = await f.student(c);
  expect(
    (await (await f.signIn(teacher)).post("/api/term-tests/bulk", {
      classroomId: String(c._id),
      term: 1,
      testNo: 1,
      gradesList: [{ studentId: String(student._id), grade: 12 }],
    })).status,
  ).toBe(200);

  const admin = await f.signIn(await f.user("admin", s));
  const res = await admin.get("/api/analytics/grade-entry?kind=tests&date=2026-10-15");
  expect(res.body).toMatchObject({ kind: "tests", term: 1, month: 10 });
  const [cls] = res.body.teachers[0].classes;
  expect(cls.columns.map((col) => [col.key, col.label, col.students, col.full])).toEqual([
    ["test1", "الاختبار الأول", 1, true],
    ["test2", "الاختبار الثاني", 0, false],
  ]);
  expect(cls.status).toBe("partial");
});
