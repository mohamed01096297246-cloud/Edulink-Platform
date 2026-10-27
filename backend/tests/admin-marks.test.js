require("./helpers/setup");
const f = require("./helpers/factory");
const School = require("../src/models/School");
const Schedule = require("../src/models/Schedule");
const ClassAssignment = require("../src/models/ClassAssignment");
const ExcelJS = require("exceljs");
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
  return { s, g, c, math, teacher, admin, a: a.student, b: b.student, parentA: a.parent };
};

// The register's workbook, read back.
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

// The cells of the row that carries a student's name.
const rowOf = (sheet, name) => {
  let found = null;
  sheet.eachRow((row) => {
    if (row.getCell(2).value === name) found = row.values.slice(1);
  });
  return found;
};

// Week 7 — week 6 has no تقييم أسبوعي (tests/no-weekly-eval-week.test.js).
const WEEK = "2026-10-25";

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

test("«غ» is a 0 in every total, and reads غ to the parent, the student and in print", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  const nameA = `${r.a.firstName} ${r.a.lastName}`;
  const week = (list) =>
    a.put("/api/admin-marks/week", { classroom: String(r.c._id), subject: String(r.math._id), weekStart: WEEK, list });
  const test1 = (grade) =>
    a.put("/api/admin-marks/test", {
      classroom: String(r.c._id), subject: String(r.math._id), term: 1, testNo: 1,
      list: [{ student: String(r.a._id), marks: { grade } }],
    });

  // Anything else that isn't a mark is still refused.
  expect((await week([{ student: String(r.a._id), marks: { weeklyEvalScore: "ع" } }])).status).toBe(400);
  expect(
    (await week([{ student: String(r.a._id), marks: { homeworkScore: "غ", weeklyEvalScore: " غائب ", attendanceScore: 10 } }]))
      .status,
  ).toBe(200);
  expect((await test1("غ")).status).toBe(200);

  // The admin's sheet reads it back as typed.
  const sheet = (await a.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${r.math._id}&weekStart=${WEEK}`)).body.data;
  expect(sheet.students.find((x) => String(x._id) === String(r.a._id)).marks).toEqual({
    homeworkScore: "غ",
    weeklyEvalScore: "غ",
    attendanceScore: 10,
  });
  const testSheet = (await a.get(`/api/admin-marks/test?classroom=${r.c._id}&subject=${r.math._id}&term=1&testNo=1`)).body.data;
  expect(testSheet.students.find((x) => String(x._id) === String(r.a._id)).marks.grade).toBe("غ");

  // A zero to the teacher, in the total too.
  const t = await f.signIn(r.teacher);
  const rowA = (await t.get(`/api/coursework/classroom/${r.c._id}/week?weekStart=${WEEK}`)).body.data.students.find(
    (x) => String(x.studentId) === String(r.a._id),
  );
  expect([rowA.homeworkScore, rowA.weeklyEvalScore, rowA.attendanceScore, rowA.total]).toEqual([0, 0, 10, 10]);

  // The parent reads غ, not a poor mark.
  const p = await f.signIn(r.parentA);
  const evaluation = (await p.get(`/api/parent/week-evaluation/${r.a._id}?weekStart=${WEEK}`)).body.data.subjects[0];
  expect([evaluation.score, evaluation.absent]).toEqual([0, true]);
  const homework = (await p.get(`/api/parent/homework-week/${r.a._id}?weekStart=${WEEK}`)).body.data.subjects[0];
  expect([homework.score, homework.absent]).toEqual([0, true]);
  const tests = (await p.get(`/api/parent/monthly-tests/${r.a._id}`)).body.data.groups[0].subjects[0];
  expect([tests.grade, tests.absent]).toEqual([0, true]);

  // So does the student, in درجاتي and أدائي.
  const s = await f.signIn(await f.user("student", r.s, { studentProfile: r.a._id }));
  expect((await s.get("/api/student/grades")).body.data.tests.groups[0].subjects[0].absent).toBe(true);
  const mine = (await s.get("/api/student/performance?term=1")).body.data.subjects.find(
    (x) => String(x.subjectId) === String(r.math._id),
  );
  expect(mine.tests).toMatchObject({ test1: 0, total: 0, absent: { test1: true, test2: false } });
  expect(mine.weeks.find((w) => String(w.weekStart).startsWith(WEEK)).absent).toMatchObject({
    homeworkScore: true,
    weeklyEvalScore: true,
    attendanceScore: false,
  });

  // The printed register writes غ in the box and 0 into the total.
  const week40 = await readWorkbook(t, `/api/grade-register/week/${r.c._id}?weekStart=${WEEK}`);
  expect(rowOf(week40, nameA).slice(2)).toEqual(["غ", "غ", 10, 10]);
  const term = await readWorkbook(t, `/api/grade-register/term/${r.c._id}?term=1`);
  const termRow = rowOf(term, nameA);
  expect(termRow).toContain("غ");
  const pdf = await t.get(`/api/grade-register/week/${r.c._id}?weekStart=${WEEK}&format=pdf`);
  expect([pdf.status, pdf.headers["content-type"]]).toEqual([200, "application/pdf"]);

  // The teacher's screen saving the 0 back keeps it; a real mark takes it off.
  const evalAgain = (score) =>
    t.post("/api/weekly-evaluation/bulk", { classroomId: String(r.c._id), weekStart: WEEK, gradesList: [{ studentId: String(r.a._id), score }] });
  await evalAgain(0);
  expect((await p.get(`/api/parent/week-evaluation/${r.a._id}?weekStart=${WEEK}`)).body.data.subjects[0].absent).toBe(true);
  await evalAgain(12);
  await evalAgain(0);
  expect((await p.get(`/api/parent/week-evaluation/${r.a._id}?weekStart=${WEEK}`)).body.data.subjects[0].absent).toBe(false);

  // And the admin typing a number over غ makes it a mark again.
  expect((await test1(9)).status).toBe(200);
  expect((await TermTest.findOne({ student: r.a._id }).lean()).absent).toBeUndefined();
  expect((await week([{ student: String(r.a._id), marks: { homeworkScore: 7 } }])).status).toBe(200);
  expect((await p.get(`/api/parent/homework-week/${r.a._id}?weekStart=${WEEK}`)).body.data.subjects[0]).toMatchObject({
    score: 7,
    absent: false,
  });
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
