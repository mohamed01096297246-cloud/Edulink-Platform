require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const MonthlyGrade = require("../src/models/MonthlyGrade");

// الدرجات ← اختبار الشهر in the parent app: the child's monthly-test marks
// this school year, month by month — on weekly40 the term's two tests.
const lesson = (s, c, sub, t, period) =>
  Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: t._id, day: "sun", period, startTime: "08:00", endTime: "08:45" });

test("the parent sees each month's test marks, newest month first", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const math = await f.subject(s, [g], { name: "رياضيات" });
  const arabic = await f.subject(s, [g], { name: "لغة عربية" });
  const level = await f.subject(s, [g], { name: "انجليزي مستوي", noMarks: true });
  const teacher = await f.user("teacher", s, { subjects: [math._id, arabic._id], teachingGrades: [g._id] });
  await lesson(s, c, math, teacher, 1);
  await lesson(s, c, arabic, teacher, 2);
  const { student, parent } = await f.student(c);
  const { student: classmate } = await f.student(c);

  const t = await f.signIn(teacher);
  const record = async (sub, month, grade) => {
    const res = await t.post("/api/monthly-grades/bulk", {
      classroomId: String(c._id),
      subjectId: String(sub._id),
      month,
      gradesList: [
        { studentId: String(student._id), grade },
        { studentId: String(classmate._id), grade: 3 },
      ],
    });
    expect(res.status).toBe(200);
  };
  await record(math, 10, 14.5);
  await record(arabic, 10, 9);
  await record(arabic, 9, 12);
  // Last school year's October and a subject that isn't marked stay out.
  const old = { student: student._id, classroom: c._id, teacher: teacher._id, school: s._id };
  await MonthlyGrade.create({ ...old, subject: math._id, month: 10, year: 2025, grade: 2 });
  await MonthlyGrade.create({ ...old, subject: level._id, month: 10, year: 2026, grade: 15 });

  const p = await f.signIn(parent);
  expect((await p.get("/api/parent/dashboard")).body.children[0].studentInfo.gradebook).toBe("classic");
  const res = await p.get(`/api/parent/monthly-tests/${student._id}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({ scheme: "classic", outOf: 15 });
  expect(res.body.data.groups).toEqual([
    {
      key: "2026-10",
      title: "أكتوبر 2026",
      subjects: [
        expect.objectContaining({ name: "رياضيات", grade: 14.5, outOf: 15, percent: 97 }),
        expect.objectContaining({ name: "لغة عربية", grade: 9, outOf: 15, percent: 60 }),
      ],
    },
    {
      key: "2026-9",
      title: "سبتمبر 2026",
      subjects: [expect.objectContaining({ name: "لغة عربية", grade: 12, percent: 80 })],
    },
  ]);
});

test("on weekly40 the parent sees the term's two tests", async () => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g], { name: "علوم" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await lesson(s, c, sub, teacher, 1);
  const { student, parent } = await f.student(c);

  const t = await f.signIn(teacher);
  for (const [testNo, grade] of [[1, 12], [2, 13.5]]) {
    const res = await t.post("/api/term-tests/bulk", {
      classroomId: String(c._id),
      term: 1,
      testNo,
      gradesList: [{ studentId: String(student._id), grade }],
    });
    expect(res.status).toBe(200);
  }

  const p = await f.signIn(parent);
  // The dashboard says so up front, so the app names the tab before loading it.
  expect((await p.get("/api/parent/dashboard")).body.children[0].studentInfo.gradebook).toBe("weekly40");
  const { data } = (await p.get(`/api/parent/monthly-tests/${student._id}`)).body;
  expect(data.scheme).toBe("weekly40");
  expect(data.groups.map((group) => [group.title, group.subjects.map((x) => x.grade)])).toEqual([
    ["الترم الأول — الاختبار الثاني", [13.5]],
    ["الترم الأول — الاختبار الأول", [12]],
  ]);
});

test("another family's child, or a parent with grades switched off, is refused", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const { student, parent } = await f.student(c);

  const stranger = await f.user("parent", s);
  expect((await (await f.signIn(stranger)).get(`/api/parent/monthly-tests/${student._id}`)).status).toBe(403);

  parent.appFeatures = { grades: false };
  await parent.save();
  expect((await (await f.signIn(parent)).get(`/api/parent/monthly-tests/${student._id}`)).status).toBe(403);
});
