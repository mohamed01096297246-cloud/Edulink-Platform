require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const ClassAssignment = require("../src/models/ClassAssignment");
const WeeklyEvaluation = require("../src/models/WeeklyEvaluation");
const CourseworkOverride = require("../src/models/CourseworkOverride");
const { computeTerm40 } = require("../src/utils/term40");
const { computeWeekScores, monthAverage } = require("../src/utils/weekScores");

// الأسبوع السادس (Sunday 18/10/2026) has no تقييم أسبوعي in any school.
const WEEK6 = "2026-10-18";
const MONTH2 = ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"];

const future = async () => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" }, features: { adminMarks: true } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const math = await f.subject(s, [g], { name: "Math" });
  const teacher = await f.user("teacher", s, { subjects: [math._id], teachingGrades: [g._id] });
  await ClassAssignment.create({ school: s._id, teacher: teacher._id, classroom: c._id, subject: math._id });
  await Schedule.create({ school: s._id, classroom: c._id, subject: math._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const admin = await f.user("admin", s);
  const { student } = await f.student(c);
  return { s, g, c, math, teacher, admin, student };
};

const week = (r, weekStart, { homework, conduct, evaluation }) =>
  Promise.all([
    CourseworkOverride.create({ student: r.student._id, subject: r.math._id, classroom: r.c._id, teacher: r.teacher._id, school: r.s._id, weekStart: new Date(`${weekStart}T00:00:00Z`), homeworkScore: homework, attendanceScore: conduct }),
    evaluation === undefined
      ? null
      : WeeklyEvaluation.create({ student: r.student._id, subject: r.math._id, classroom: r.c._id, teacher: r.teacher._id, school: r.s._id, weekStart: new Date(`${weekStart}T00:00:00Z`), score: evaluation }),
  ]);

test("week 6's total leaves the evaluation out, and the month isn't pulled down for it", async () => {
  const r = await future();
  // A full-marks pupil — and an evaluation someone filed under week 6 anyway.
  await week(r, MONTH2[0], { homework: 10, conduct: 10, evaluation: 5 });
  for (const w of MONTH2.slice(1)) await week(r, w, { homework: 10, conduct: 10, evaluation: 20 });

  const w6 = (await computeWeekScores(r.c._id, r.math._id, [r.student._id], new Date(`${WEEK6}T00:00:00Z`), "weekly40"))[String(r.student._id)];
  expect([w6.weeklyEvalScore, w6.total, w6.weeklyEvalApplies]).toEqual([null, 20, false]);

  const term = await computeTerm40({ classroom: r.c, subjectId: r.math._id, students: [r.student], term: 1 });
  expect(JSON.stringify(term)).toContain('"2":40');

  // The rule on its own: the month's evaluation is the other weeks', the rest every week's.
  const at = (iso) => new Date(`${iso}T00:00:00Z`);
  expect(
    monthAverage([
      { weekStart: at(MONTH2[0]), total: 18, weeklyEvalScore: null },
      { weekStart: at(MONTH2[1]), total: 36, weeklyEvalScore: 16 },
      { weekStart: at(MONTH2[2]), total: 40, weeklyEvalScore: 20 },
    ]),
  ).toBe(37.5);
  // A month with every week evaluated is plain average of the totals, as before.
  expect(monthAverage([{ weekStart: at(MONTH2[1]), total: 35 }, { weekStart: at(MONTH2[2]), total: 38 }])).toBe(36.5);
  // The month's only week so far is week 6: it counts at its own share,
  // 18.5 of 20 being 37 of 40 — not 18.5 of 40.
  expect(monthAverage([{ weekStart: at(WEEK6), total: 18.5, weeklyEvalScore: null }], "weekly40")).toBe(37);
  expect(monthAverage([{ weekStart: at(WEEK6), total: 18.5, weeklyEvalScore: null }])).toBe(18.5);
});

test("الشهر الثاني with only week 6 recorded isn't pulled down — in the register and on the student's أدائي", async () => {
  const r = await future();
  await week(r, WEEK6, { homework: 9.5, conduct: 9 });
  const account = await f.user("student", r.s, { studentProfile: r.student._id });

  const term = await computeTerm40({ classroom: r.c, subjectId: r.math._id, students: [r.student], term: 1 });
  expect(JSON.stringify(term)).toContain('"2":37');

  const data = (await (await f.signIn(account)).get("/api/student/performance?term=1")).body.data;
  const math = data.subjects.find((s) => s.subject === "Math");
  expect(math.monthAverages.find((m) => m.schoolMonth === 2).average).toBe(37);
  expect(math.weeks).toEqual([expect.objectContaining({ total: 18.5, weeklyEvalApplies: false })]);
});

test("the teacher can't record week 6's evaluation, and the screen says why", async () => {
  const r = await future();
  const t = await f.signIn(r.teacher);
  const got = (await t.get(`/api/weekly-evaluation/classroom/${r.c._id}?weekStart=${WEEK6}`)).body.data;
  expect(got.noWeeklyEval).toBe(true);
  expect(got.scores).toEqual({});
  const saved = await t.post("/api/weekly-evaluation/bulk", { classroomId: String(r.c._id), weekStart: WEEK6, gradesList: [{ studentId: String(r.student._id), score: 15 }] });
  expect(saved.status).toBe(400);
  expect(saved.body.message).toMatch(/مالوش تقييم أسبوعي/);
  // The week after is as ever.
  const next = await t.post("/api/weekly-evaluation/bulk", { classroomId: String(r.c._id), weekStart: "2026-10-25", gradesList: [{ studentId: String(r.student._id), score: 15 }] });
  expect(next.status).toBe(200);
});

test("the admin's week 6 sheet has no evaluation column, and the report doesn't ask for one", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  const sheet = (await a.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${r.math._id}&weekStart=${WEEK6}`)).body.data;
  expect(sheet.columns.map((c) => c.key)).toEqual(["homeworkScore", "attendanceScore"]);
  expect(sheet.total).toBe(20);
  expect(sheet.note).toMatch(/مالوش تقييم أسبوعي/);
  const refused = await a.put("/api/admin-marks/week", { classroom: String(r.c._id), subject: String(r.math._id), weekStart: WEEK6, list: [{ student: String(r.student._id), marks: { weeklyEvalScore: 12 } }] });
  expect(refused.status).toBe(400);
  expect((await a.put("/api/admin-marks/week", { classroom: String(r.c._id), subject: String(r.math._id), weekStart: WEEK6, list: [{ student: String(r.student._id), marks: { homeworkScore: 10, attendanceScore: 10 } }] })).status).toBe(200);

  // «آخر التطورات» for week 6: homework and conduct in, nothing owed for the evaluation.
  const report = (await a.get(`/api/analytics/grade-entry?period=week&date=2026-10-20`)).body;
  const row = JSON.stringify(report);
  const cls = (report.data?.teachers || report.teachers || [])[0]?.classes?.[0];
  if (!cls) throw new Error(`no class in the report: ${row.slice(0, 400)}`);
  const weekly = cls.columns.find((c) => c.key === "weekly");
  expect([weekly.applicable, weekly.entered]).toEqual([false, false]);
  expect(cls.status).toBe("complete");
});
