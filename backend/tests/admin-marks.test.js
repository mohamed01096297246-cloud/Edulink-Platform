require("./helpers/setup");
const f = require("./helpers/factory");
const School = require("../src/models/School");
const Schedule = require("../src/models/Schedule");
const ClassAssignment = require("../src/models/ClassAssignment");
const WeeklyEvaluation = require("../src/models/WeeklyEvaluation");
const TermTest = require("../src/models/TermTest");

// Future's preparatory register (weekly40), with the admin allowed to
// record marks from the web panel.
const future = async ({ on = true } = {}) => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" }, features: { adminMarks: on } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const math = await f.subject(s, [g], { name: "Math" });
  const teacher = await f.user("teacher", s, { subjects: [math._id], teachingGrades: [g._id] });
  await ClassAssignment.create({ school: s._id, teacher: teacher._id, classroom: c._id, subject: math._id });
  await Schedule.create({ school: s._id, classroom: c._id, subject: math._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const admin = await f.user("admin", s);
  const a = await f.student(c);
  const b = await f.student(c);
  return { s, g, c, math, teacher, admin, a: a.student, b: b.student };
};

const WEEK = "2026-10-18";

test("a school without it can't reach it; with it, the admin sees its classes, subjects and weeks", async () => {
  const off = await future({ on: false });
  expect((await (await f.signIn(off.admin)).get("/api/admin-marks/options")).status).toBe(403);

  const r = await future();
  const res = await (await f.signIn(r.admin)).get("/api/admin-marks/options");
  expect(res.status).toBe(200);
  const cls = res.body.data.classes.find((c) => String(c._id) === String(r.c._id));
  expect(cls.scheme).toBe("weekly40");
  expect(cls.terms).toBe(true);
  expect(cls.subjects.map((x) => `${x.name}|${x.teacher}`)).toEqual([`Math|${r.teacher.firstName} ${r.teacher.lastName}`]);
  expect(res.body.data.weeks[res.body.data.weeks.length - 1]).toMatchObject({ weekStart: "2026-09-20", label: "الأسبوع الثاني" });
  // The other school's classes are not offered.
  expect(res.body.data.classes.some((c) => String(c._id) === String(off.c._id))).toBe(false);
});

test("the admin's week lands in the teacher's own register, under the teacher", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  const sheet = (await a.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${r.math._id}&weekStart=${WEEK}`)).body.data;
  expect(sheet.columns.map((c) => `${c.label}/${c.max}`)).toEqual(["الواجب/10", "التقييم الأسبوعي/20", "مواظبة وسلوك/10"]);
  expect(sheet.total).toBe(40);
  expect(sheet.students).toHaveLength(2);

  const save = (list) => a.put("/api/admin-marks/week", { classroom: String(r.c._id), subject: String(r.math._id), weekStart: WEEK, list });
  expect((await save([{ student: String(r.a._id), marks: { weeklyEvalScore: 25 } }])).status).toBe(400);
  expect((await save([{ student: String(r.a._id), marks: { weeklyEvalScore: 7.3 } }])).status).toBe(400);
  const ok = await save([
    { student: String(r.a._id), marks: { homeworkScore: 9, weeklyEvalScore: 17.5, attendanceScore: 10 } },
    { student: String(r.b._id), marks: { weeklyEvalScore: 12 } },
  ]);
  expect(ok.status).toBe(200);

  // The teacher's screen shows them, as theirs.
  const t = await f.signIn(r.teacher);
  const theirs = (await t.get(`/api/coursework/classroom/${r.c._id}/week?weekStart=${WEEK}`)).body.data.students;
  const rowA = theirs.find((x) => String(x.studentId) === String(r.a._id));
  expect([rowA.homeworkScore, rowA.weeklyEvalScore, rowA.attendanceScore, rowA.total]).toEqual([9, 17.5, 10, 36.5]);
  const stored = await WeeklyEvaluation.findOne({ student: r.a._id });
  expect(String(stored.teacher)).toBe(String(r.teacher._id));

  // And what the teacher then changes is what the admin sees next.
  await t.post("/api/weekly-evaluation/bulk", { classroomId: String(r.c._id), weekStart: WEEK, gradesList: [{ studentId: String(r.a._id), score: 19 }] });
  const again = (await a.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${r.math._id}&weekStart=${WEEK}`)).body.data.students;
  expect(again.find((x) => String(x._id) === String(r.a._id)).marks.weeklyEvalScore).toBe(19);

  // Clearing a mark removes it.
  expect((await save([{ student: String(r.b._id), marks: { weeklyEvalScore: null } }])).status).toBe(200);
  expect(await WeeklyEvaluation.countDocuments({ student: r.b._id })).toBe(0);
});

test("the term's tests too, and the teacher reads them back", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  const put = (grade) =>
    a.put("/api/admin-marks/test", {
      classroom: String(r.c._id), subject: String(r.math._id), term: 1, testNo: 1,
      list: [{ student: String(r.a._id), marks: { grade } }],
    });
  expect((await put(16)).status).toBe(400);
  expect((await put(14.5)).status).toBe(200);
  const sheet = (await a.get(`/api/admin-marks/test?classroom=${r.c._id}&subject=${r.math._id}&term=1&testNo=1`)).body.data;
  expect(sheet.students.find((x) => String(x._id) === String(r.a._id)).marks.grade).toBe(14.5);

  const theirs = (await (await f.signIn(r.teacher)).get(`/api/term-tests/classroom/${r.c._id}?term=1&testNo=1`)).body.data;
  expect(JSON.stringify(theirs)).toContain("14.5");
  expect(String((await TermTest.findOne({ student: r.a._id })).teacher)).toBe(String(r.teacher._id));
});

test("where the school has a stage principal, the whole-school admin may look but the principal records", async () => {
  const r = await future();
  const principal = await f.user("admin", r.s, { isPrimaryAdmin: false, managedStages: ["preparatory"] });
  const body = { classroom: String(r.c._id), subject: String(r.math._id), weekStart: WEEK, list: [{ student: String(r.a._id), marks: { weeklyEvalScore: 15 } }] };

  const general = await f.signIn(r.admin);
  expect((await general.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${r.math._id}&weekStart=${WEEK}`)).status).toBe(200);
  expect((await general.put("/api/admin-marks/week", body)).status).toBe(403);
  expect((await (await f.signIn(principal)).put("/api/admin-marks/week", body)).status).toBe(200);
});

test("another school's class or a subject the class isn't taught are refused", async () => {
  const r = await future();
  const other = await future();
  const a = await f.signIn(r.admin);
  expect((await a.get(`/api/admin-marks/week?classroom=${other.c._id}&subject=${other.math._id}&weekStart=${WEEK}`)).status).toBe(404);
  const art = await f.subject(r.s, [r.g], { name: "Art" });
  expect((await a.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${art._id}&weekStart=${WEEK}`)).status).toBe(400);
  await School.updateOne({ _id: r.s._id }, { $set: { "features.adminMarks": false } });
  expect((await a.get("/api/admin-marks/options")).status).toBe(403);
});
