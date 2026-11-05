require("./helpers/setup");
const f = require("./helpers/factory");
const ExcelJS = require("exceljs");
const Schedule = require("../src/models/Schedule");
const ClassAssignment = require("../src/models/ClassAssignment");
const WeeklyEvaluation = require("../src/models/WeeklyEvaluation");
const CourseworkOverride = require("../src/models/CourseworkOverride");
const TermTest = require("../src/models/TermTest");
const MonthlyGrade = require("../src/models/MonthlyGrade");
const Notification = require("../src/models/Notification");

// «م» — منقطع (Mohamed, 2026-11-05): the teacher's app takes م and غ in every
// mark; غ is a 0, م is no mark at all — no total, left out of every average —
// and both read as typed wherever a mark is shown.

const realFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => "" }));
});
afterEach(() => {
  global.fetch = realFetch;
});

const future = async () => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" }, features: { adminMarks: true } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const math = await f.subject(s, [g], { name: "Math" });
  const teacher = await f.user("teacher", s, { subjects: [math._id], teachingGrades: [g._id] });
  await ClassAssignment.create({ school: s._id, teacher: teacher._id, classroom: c._id, subject: math._id });
  await Schedule.create({ school: s._id, classroom: c._id, subject: math._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const admin = await f.user("admin", s);
  const a = await f.student(c);
  const b = await f.student(c);
  return { s, c, math, teacher, admin, a: a.student, b: b.student, parentA: a.parent };
};

const readWorkbook = async (client, url) => {
  const res = await client
    .get(url)
    .buffer(true)
    .parse((stream, done) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => done(null, Buffer.concat(chunks)));
    });
  expect(res.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  return workbook.worksheets[0];
};
const rowOf = (sheet, name) => {
  let found = null;
  sheet.eachRow((row) => {
    if (row.getCell(2).value === name) found = row.values.slice(1);
  });
  return found;
};

// الشهر الأول: weeks 2–5.
const W2 = "2026-09-20";
const W3 = "2026-09-27";
const W4 = "2026-10-04";

test("the teacher's app records م and غ; م has no total and stays out of the month and the term", async () => {
  const r = await future();
  const t = await f.signIn(r.teacher);
  const classroomId = String(r.c._id);
  const A = String(r.a._id);
  const B = String(r.b._id);
  const week = async (weekStart, a, b) => {
    const evalRes = await t.post("/api/weekly-evaluation/bulk", {
      classroomId, weekStart, letters: true,
      gradesList: [{ studentId: A, score: a.eval }, { studentId: B, score: b.eval }],
    });
    expect(evalRes.status).toBe(200);
    const rest = await t.post("/api/coursework/week/bulk", {
      classroomId, weekStart, letters: true,
      list: [
        { studentId: A, homeworkScore: a.hw, attendanceScore: a.conduct },
        { studentId: B, homeworkScore: b.hw, attendanceScore: b.conduct },
      ],
    });
    expect(rest.status).toBe(200);
  };

  // A: a full week, a week all م, and a week with only the evaluation م.
  // B: a full week, a week all غ (0), and another full week.
  await week(W2, { eval: 20, hw: 10, conduct: 10 }, { eval: 20, hw: 10, conduct: 10 });
  await week(W3, { eval: "م", hw: "م", conduct: "م" }, { eval: "غ", hw: "غ", conduct: "غ" });
  await week(W4, { eval: "م", hw: 10, conduct: 10 }, { eval: 20, hw: 10, conduct: 10 });

  const stored = await WeeklyEvaluation.findOne({ student: r.a._id, weekStart: new Date(W3) }).lean();
  expect([stored.score, stored.withdrawn, stored.absent]).toEqual([0, true, undefined]);
  const override = await CourseworkOverride.findOne({ student: r.b._id, weekStart: new Date(W3) }).lean();
  expect([override.homeworkScore, override.homeworkAbsent, override.homeworkWithdrawn]).toEqual([0, true, undefined]);

  // The teacher's screens read them back as typed.
  const evalW3 = (await t.get(`/api/weekly-evaluation/classroom/${classroomId}?weekStart=${W3}`)).body.data;
  expect([evalW3.withdrawn, evalW3.absent]).toEqual([{ [A]: true }, { [B]: true }]);
  const cardW3 = (await t.get(`/api/coursework/classroom/${classroomId}/week?weekStart=${W3}`)).body.data.students;
  const rowA3 = cardW3.find((x) => String(x.studentId) === A);
  expect(rowA3).toMatchObject({ total: 0, withdrawnWeek: true, withdrawn: { homeworkScore: true, weeklyEvalScore: true, attendanceScore: true } });
  expect(cardW3.find((x) => String(x.studentId) === B)).toMatchObject({ total: 0, withdrawnWeek: false });

  // The month: A is 40 (their م week left out, the م evaluation standing at
  // their own other weeks' 20), B is (40 + 0 + 40) / 3 = 26.67 → 27
  // (utils/halfMarks: .7 goes up).
  const s = await f.signIn(await f.user("student", r.s, { studentProfile: r.a._id }));
  const mine = (await s.get("/api/student/performance?term=1")).body.data.subjects.find((x) => String(x.subjectId) === String(r.math._id));
  expect(mine.monthAverages[0]).toMatchObject({ average: 40, withdrawn: false });
  expect(mine.weeks.find((w) => String(w.weekStart).startsWith(W3))).toMatchObject({ withdrawnWeek: true });

  const nameA = `${r.a.firstName} ${r.a.lastName}`;
  const nameB = `${r.b.firstName} ${r.b.lastName}`;
  const month = await readWorkbook(t, `/api/grade-register/month/${classroomId}?schoolMonth=1`);
  const monthA = rowOf(month, nameA);
  // Week 2, then week 3 all م with an م total, then week 4.
  expect(monthA.slice(2, 10)).toEqual([10, 20, 10, 40, "م", "م", "م", "م"]);
  expect(monthA[monthA.length - 1]).toBe(40);
  expect(rowOf(month, nameB)[rowOf(month, nameB).length - 1]).toBe(27);

  // A test that is م adds nothing: the term is the month alone.
  const tests = await t.post("/api/term-tests/bulk", {
    classroomId, term: 1, testNo: 1, letters: true,
    gradesList: [{ studentId: A, grade: "م" }, { studentId: B, grade: "غ" }],
  });
  expect(tests.status).toBe(200);
  const term = await readWorkbook(t, `/api/grade-register/term/${classroomId}?term=1`);
  const termA = rowOf(term, nameA);
  expect(termA).toContain("م");
  expect(termA).toContain(40);
  expect(rowOf(term, nameB)).toContain("غ");
  const pdf = await t.get(`/api/grade-register/term/${classroomId}?term=1&format=pdf`);
  expect([pdf.status, pdf.headers["content-type"]]).toEqual([200, "application/pdf"]);

  // The parent and the student read م, not 0.
  const p = await f.signIn(r.parentA);
  const evaluation = (await p.get(`/api/parent/week-evaluation/${A}?weekStart=${W3}`)).body.data;
  expect(evaluation.subjects[0]).toMatchObject({ withdrawn: true, absent: false });
  expect(evaluation.overall).toBeNull();
  expect((await p.get(`/api/parent/homework-week/${A}?weekStart=${W3}`)).body.data.subjects[0]).toMatchObject({ withdrawn: true });
  expect((await p.get(`/api/parent/monthly-tests/${A}`)).body.data.groups[0].subjects[0]).toMatchObject({ withdrawn: true });
  const perf = (await s.get("/api/student/performance?term=1")).body.data.subjects.find((x) => String(x.subjectId) === String(r.math._id));
  expect(perf.tests).toMatchObject({ test1: null, total: null, withdrawn: { test1: true, test2: false } });

  // The admin's page reads م back.
  const a = await f.signIn(r.admin);
  const sheet = (await a.get(`/api/admin-marks/week?classroom=${classroomId}&subject=${r.math._id}&weekStart=${W3}`)).body.data;
  expect(sheet.students.find((x) => String(x._id) === A).marks).toEqual({ homeworkScore: "م", weeklyEvalScore: "م", attendanceScore: "م" });
  const testSheet = (await a.get(`/api/admin-marks/test?classroom=${classroomId}&subject=${r.math._id}&term=1&testNo=1`)).body.data;
  expect(testSheet.students.find((x) => String(x._id) === A).marks.grade).toBe("م");
});

test("an app from before the letters saves a م or غ pupil's 0 back and keeps it; the new app's 0 is a 0", async () => {
  const r = await future();
  const t = await f.signIn(r.teacher);
  const classroomId = String(r.c._id);
  const A = String(r.a._id);
  const save = (score, letters) =>
    t.post("/api/weekly-evaluation/bulk", { classroomId, weekStart: W2, ...(letters ? { letters: true } : {}), gradesList: [{ studentId: A, score }] });

  expect((await save("م", true)).status).toBe(200);
  expect((await save(0, false)).status).toBe(200);
  expect((await WeeklyEvaluation.findOne({ student: r.a._id }).lean()).withdrawn).toBe(true);
  expect((await save(0, true)).status).toBe(200);
  const now = await WeeklyEvaluation.findOne({ student: r.a._id }).lean();
  expect([now.score, now.withdrawn, now.absent]).toEqual([0, undefined, undefined]);

  // غ over م, and م over غ: one flag at a time.
  await save("غ", true);
  expect(await WeeklyEvaluation.findOne({ student: r.a._id }).lean()).toMatchObject({ absent: true });
  await save("منقطع", true);
  const last = await WeeklyEvaluation.findOne({ student: r.a._id }).lean();
  expect([last.withdrawn, last.absent]).toEqual([true, undefined]);

  // Anything else that isn't a mark is still refused.
  expect((await save("ع", true)).status).toBe(400);
  expect((await save(25, true)).status).toBe(400);
});

test("the classic register's monthly test and classwork take غ and م too, and the term overview leaves م out", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g, { academicYear: "2026/2027" });
  const sub = await f.subject(s, [g], { name: "Science" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const a = (await f.student(c)).student;
  const b = (await f.student(c)).student;
  const t = await f.signIn(teacher);
  const classroomId = String(c._id);

  const monthly = await t.post("/api/monthly-grades/bulk", {
    classroomId, month: 10, letters: true,
    gradesList: [{ studentId: String(a._id), grade: "م" }, { studentId: String(b._id), grade: "غ" }],
  });
  expect(monthly.status).toBe(200);
  const read = (await t.get(`/api/monthly-grades/classroom/${classroomId}?month=10`)).body.data;
  expect([read.withdrawn, read.absent]).toEqual([{ [String(a._id)]: true }, { [String(b._id)]: true }]);
  expect((await MonthlyGrade.findOne({ student: a._id }).lean()).withdrawn).toBe(true);

  const classwork = await t.post("/api/classwork-notebook/bulk", {
    classroomId, weekStart: W2, letters: true,
    gradesList: [{ studentId: String(a._id), score: "م" }, { studentId: String(b._id), score: 4.5 }],
  });
  expect(classwork.status).toBe(200);
  expect((await t.get(`/api/classwork-notebook/classroom/${classroomId}?weekStart=${W2}`)).body.data.withdrawn).toEqual({ [String(a._id)]: true });

  // م is not a 0 in the term's averages; غ is.
  const overview = (await t.get(`/api/coursework/classroom/${classroomId}`)).body.data.students;
  expect(overview.find((x) => String(x.studentId) === String(a._id))).toMatchObject({ monthlyTestScore: null, classworkNotebookScore: null });
  expect(overview.find((x) => String(x.studentId) === String(b._id))).toMatchObject({ monthlyTestScore: 0, classworkNotebookScore: 4.5 });
});

test("غ tells the student so; م tells them nothing", async () => {
  const r = await future();
  const accountA = await f.user("student", r.s, { studentProfile: r.a._id });
  const accountB = await f.user("student", r.s, { studentProfile: r.b._id });
  const t = await f.signIn(r.teacher);
  const res = await t.post("/api/weekly-evaluation/bulk", {
    classroomId: String(r.c._id), weekStart: W4, letters: true,
    gradesList: [{ studentId: String(r.a._id), score: "م" }, { studentId: String(r.b._id), score: "غ" }],
  });
  expect(res.status).toBe(200);
  expect(await Notification.countDocuments({ user: accountA._id })).toBe(0);
  const told = await Notification.find({ user: accountB._id }).lean();
  expect(told).toHaveLength(1);
  expect(told[0].message).toContain("التقييم الأسبوعي: غ (غياب)");
});
