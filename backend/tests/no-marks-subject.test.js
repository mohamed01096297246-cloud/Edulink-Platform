require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const WeeklyEvaluation = require("../src/models/WeeklyEvaluation");

const lesson = (s, c, sub, t, period) =>
  Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: t._id, day: "sun", period, startTime: "08:00", endTime: "08:45" });

// Al-Rahma's «انجليزي مستوي»: taught beside «انجليزي حكومي» by the same
// teachers, sometimes in a class where a colleague takes «انجليزي حكومي».
// It is on the timetable but carries no marks (Subject.noMarks).
const rahma = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const g2 = await f.grade(s);
  const both = await f.classroom(g);
  const levelOnly = await f.classroom(g);
  const otherGrade = await f.classroom(g2);
  const gov = await f.subject(s, [g, g2], { name: "انجليزي حكومي" });
  const level = await f.subject(s, [g, g2], { name: "انجليزي مستوي", noMarks: true });
  const teacher = await f.user("teacher", s, { subjects: [gov._id, level._id], teachingGrades: [] });
  const colleague = await f.user("teacher", s, { subjects: [gov._id], teachingGrades: [] });
  await lesson(s, both, gov, teacher, 1);
  await lesson(s, both, level, teacher, 2);
  await lesson(s, levelOnly, level, teacher, 3);
  await lesson(s, levelOnly, gov, colleague, 4);
  await lesson(s, otherGrade, level, teacher, 5);
  const { student: a, parent } = await f.student(both);
  const { student: b } = await f.student(levelOnly);
  return { s, g, g2, both, levelOnly, otherGrade, gov, level, teacher, colleague, a, b, parent };
};

test("a subject with no marks is left out of a teacher's recording, not their timetable", async () => {
  const r = await rahma();
  const t = await f.signIn(r.teacher);
  const week = "2026-10-04";

  // The subject picker of a marking screen offers «انجليزي حكومي» alone —
  // and nothing in the class where all the teacher takes is the level.
  const subjects = async (classroom, marks) =>
    (await t.get(`/api/teacher/my-subjects?classroomId=${classroom._id}${marks ? "&marks=1" : ""}`)).body.data.subjects.map((x) => x.name);
  expect(await subjects(r.both, true)).toEqual(["انجليزي حكومي"]);
  expect(await subjects(r.levelOnly, true)).toEqual([]);
  // Homework and board notes still see both.
  expect((await subjects(r.both, false)).sort()).toEqual(["انجليزي حكومي", "انجليزي مستوي"]);

  // Its classes and grades: a marking screen skips where only the level is taught.
  const rooms = async (grade, marks) =>
    (await t.get(`/api/monthly-grades/classrooms/${grade._id}${marks ? "?marks=1" : ""}`)).body.data.map((c) => String(c._id)).sort();
  expect(await rooms(r.g, true)).toEqual([String(r.both._id)]);
  expect(await rooms(r.g, false)).toEqual([String(r.both._id), String(r.levelOnly._id)].sort());
  const grades = (await t.get("/api/results/teacher-grades")).body.data;
  expect(Object.fromEntries(grades.map((x) => [String(x._id), x.marks]))).toEqual({ [String(r.g._id)]: true, [String(r.g2._id)]: false });

  // A save with no subject lands on «انجليزي حكومي»; one naming the level,
  // or one in the level-only class, is refused — it must never write the
  // colleague's «انجليزي حكومي» there.
  const save = (classroom, student, extra = {}) =>
    t.post("/api/weekly-evaluation/bulk", { classroomId: String(classroom._id), weekStart: week, gradesList: [{ studentId: String(student._id), score: 7 }], ...extra });
  expect((await save(r.both, r.a)).status).toBe(200);
  expect((await WeeklyEvaluation.findOne({ student: r.a._id })).subject).toEqual(r.gov._id);
  expect((await save(r.both, r.a, { subjectId: String(r.level._id) })).status).toBe(400);
  const refused = await save(r.levelOnly, r.b);
  expect(refused.status).toBe(400);
  expect(refused.body.message).toContain("مش بيترصد لها درجات");
  expect(await WeeklyEvaluation.countDocuments({ student: r.b._id })).toBe(0);

  // «آخر التطورات» lists only what is owed.
  const progress = (await t.get("/api/teacher/progress?date=2026-10-06")).body.classes;
  expect(progress.map((c) => `${c.subject} ${c.classroomId}`)).toEqual([`انجليزي حكومي ${r.both._id}`]);
  const theirs = (await (await f.signIn(r.colleague)).get("/api/teacher/progress?date=2026-10-06")).body.classes;
  expect(theirs.map((c) => `${c.subject} ${c.classroomId}`)).toEqual([`انجليزي حكومي ${r.levelOnly._id}`]);

  // Parents don't get an empty grade card for it.
  const p = await f.signIn(r.parent);
  const week1 = (await p.get(`/api/parent/week-evaluation/${r.a._id}?weekStart=${week}`)).body.data;
  expect(week1.subjects.map((x) => x.name)).toEqual(["انجليزي حكومي"]);
  const homework = (await p.get(`/api/parent/homework-week/${r.a._id}?weekStart=${week}`)).body.data;
  expect(homework.subjects.map((x) => x.name)).toEqual(["انجليزي حكومي"]);
});

test("conduct, classwork and homework marks take quarters, and a week adds them up exactly", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await lesson(s, c, sub, teacher, 1);
  const { student: a } = await f.student(c);
  const t = await f.signIn(teacher);
  const week = "2026-10-04";
  const id = String(a._id);

  const coursework = (entry) => t.post("/api/coursework/week/bulk", { classroomId: String(c._id), weekStart: week, list: [{ studentId: id, ...entry }] });
  expect((await coursework({ homeworkScore: 4.25, attendanceScore: 3.5 })).status).toBe(200);
  const bad = await coursework({ homeworkScore: 4.3 });
  expect(bad.status).toBe(400);
  expect(bad.body.message).toContain("بربع أو نص درجة");
  expect((await coursework({ homeworkScore: 5.25 })).status).toBe(400);

  const notebook = (score) => t.post("/api/classwork-notebook/bulk", { classroomId: String(c._id), weekStart: week, gradesList: [{ studentId: id, score }] });
  expect((await notebook(4.75)).status).toBe(200);
  expect((await notebook(4.6)).status).toBe(400);
  expect((await notebook(4.5)).status).toBe(200);

  expect((await t.post("/api/weekly-evaluation/bulk", { classroomId: String(c._id), weekStart: week, gradesList: [{ studentId: id, score: 10 }] })).status).toBe(200);

  // 4.25 + 3.5 + 4.5 + 10: 22.25, not rounded to 22.3.
  const row = (await t.get(`/api/coursework/classroom/${c._id}/week?weekStart=${week}`)).body.data.students[0];
  expect(row).toMatchObject({ homeworkScore: 4.25, attendanceScore: 3.5, classworkScore: 4.5, weeklyEvalScore: 10 });
  expect(row.total).toBe(22.25);
});
