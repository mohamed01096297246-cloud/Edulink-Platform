require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const ClassAssignment = require("../src/models/ClassAssignment");
const WeeklyEvaluation = require("../src/models/WeeklyEvaluation");
const CourseworkOverride = require("../src/models/CourseworkOverride");
const ClassworkNotebook = require("../src/models/ClassworkNotebook");
const MarkingSkip = require("../src/models/MarkingSkip");
const { computeTerm40 } = require("../src/utils/term40");
const { computeWeekScores, monthAverage } = require("../src/utils/weekScores");
const { buildWeek40Workbook, buildWeeklyRegisterWorkbook } = require("../src/utils/gradeRegisterExcel");

// «رفع بند من الرصد»: an admin takes a column of a week off for a class's
// subject; the week is out of the columns left, everywhere.
const WEEK7 = "2026-10-25";
const WEEK8 = "2026-11-01";
const at = (iso) => new Date(`${iso}T00:00:00Z`);

const school = async (gradebook) => {
  const s = await f.school({ gradebook, features: { adminMarks: true } });
  const g = await f.grade(s, gradebook.preparatory ? { stage: "preparatory" } : {});
  const c = await f.classroom(g);
  const c2 = await f.classroom(g);
  const arabic = await f.subject(s, [g], { name: "لغة عربية" });
  const teacher = await f.user("teacher", s, { subjects: [arabic._id], teachingGrades: [g._id] });
  for (const room of [c, c2]) {
    await ClassAssignment.create({ school: s._id, teacher: teacher._id, classroom: room._id, subject: arabic._id });
    await Schedule.create({ school: s._id, classroom: room._id, subject: arabic._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  }
  const admin = await f.user("admin", s);
  const { student, parent } = await f.student(c);
  return { s, g, c, c2, arabic, teacher, admin, student, parent };
};
const future = () => school({ preparatory: "weekly40" });

const filed = (r, weekStart, { homework, conduct, evaluation }) =>
  Promise.all([
    CourseworkOverride.create({ student: r.student._id, subject: r.arabic._id, classroom: r.c._id, teacher: r.teacher._id, school: r.s._id, weekStart: at(weekStart), homeworkScore: homework, attendanceScore: conduct }),
    evaluation === undefined
      ? null
      : WeeklyEvaluation.create({ student: r.student._id, subject: r.arabic._id, classroom: r.c._id, teacher: r.teacher._id, school: r.s._id, weekStart: at(weekStart), score: evaluation }),
  ]);

const takeOff = (a, r, columns, classrooms = [r.c._id, r.c2._id], weekStart = WEEK7) =>
  a.put("/api/marking-skips", { weekStart, subject: String(r.arabic._id), classrooms: classrooms.map(String), columns });

test("the admin finds the teacher, the subject and their classes, and takes the evaluation off them", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  const options = (await a.get("/api/marking-skips/options")).body.data;
  const teacher = options.teachers.find((t) => String(t._id) === String(r.teacher._id));
  expect(teacher.subjects).toEqual([
    expect.objectContaining({ name: "لغة عربية", classes: expect.arrayContaining([expect.objectContaining({ scheme: "weekly40" })]) }),
  ]);
  expect(teacher.subjects[0].classes).toHaveLength(2);
  expect(options.schemes.weekly40.columns.map((c) => c.key)).toEqual(["homeworkScore", "weeklyEvalScore", "attendanceScore"]);
  expect(options.weeks.some((w) => w.weekStart === WEEK7)).toBe(true);

  const res = await takeOff(a, r, ["weeklyEvalScore"]);
  expect(res.status).toBe(200);
  expect(res.body.message).toMatch(/التقييم الأسبوعي/);

  const list = (await a.get("/api/marking-skips")).body.data;
  expect(list).toHaveLength(2);
  expect(list[0]).toMatchObject({ weekStart: WEEK7, columns: [{ key: "weeklyEvalScore", label: "التقييم الأسبوعي" }], weekTotal: 40, outOf: 20 });
  expect(list[0].teacher).toBe(`${r.teacher.firstName} ${r.teacher.lastName}`);
});

test("the week is out of what is left; the month stands the column at its other weeks; putting it back counts the filed mark again", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  // An evaluation the teacher filed before it was taken off.
  await filed(r, WEEK7, { homework: 10, conduct: 10, evaluation: 5 });
  await filed(r, WEEK8, { homework: 8, conduct: 10, evaluation: 16 });
  await takeOff(a, r, ["weeklyEvalScore"]);

  const w7 = (await computeWeekScores(r.c._id, r.arabic._id, [r.student._id], at(WEEK7), "weekly40"))[String(r.student._id)];
  expect(w7).toMatchObject({ weeklyEvalScore: null, total: 20, outOf: 20, skipped: ["weeklyEvalScore"], weeklyEvalApplies: false });

  // الشهر الثاني: week 7 is 20 + the month's other evaluation (16) = 36, week 8 is 34.
  const term = await computeTerm40({ classroom: r.c, subjectId: r.arabic._id, students: [r.student], term: 1 });
  expect(term.rows[String(r.student._id)].monthAverages[2]).toBe(35);

  // Another class's subject is untouched.
  const other = await computeWeekScores(r.c._id, r.arabic._id, [r.student._id], at(WEEK8), "weekly40");
  expect(other[String(r.student._id)]).toMatchObject({ total: 34, outOf: 40, skipped: [] });

  const doc = await MarkingSkip.findOne({ classroom: r.c._id });
  expect((await a.del(`/api/marking-skips/${doc._id}?column=weeklyEvalScore`)).status).toBe(200);
  expect(await MarkingSkip.countDocuments({ classroom: r.c._id })).toBe(0);
  const back = (await computeWeekScores(r.c._id, r.arabic._id, [r.student._id], at(WEEK7), "weekly40"))[String(r.student._id)];
  expect(back).toMatchObject({ weeklyEvalScore: 5, total: 25, outOf: 40, skipped: [] });
  // Nothing was deleted on the way.
  expect(await WeeklyEvaluation.countDocuments({ student: r.student._id })).toBe(2);
});

test("monthAverage stands any column taken off at its other weeks, or scales the week when there is none", () => {
  const weeks = [
    { weekStart: at(WEEK7), total: 30, homeworkScore: null, weeklyEvalScore: 20, attendanceScore: 10, skipped: ["homeworkScore"] },
    { weekStart: at(WEEK8), total: 36, homeworkScore: 8, weeklyEvalScore: 18, attendanceScore: 10, skipped: [] },
  ];
  // 30 + 8 = 38 and 36 → 37.
  expect(monthAverage(weeks, "weekly40")).toBe(37);
  // Alone in its month: 30 of 30 is 40 of 40.
  expect(monthAverage([weeks[0]], "weekly40")).toBe(40);
  // Every column taken off: nothing to count.
  expect(monthAverage([{ weekStart: at(WEEK7), total: 0, skipped: ["homeworkScore", "weeklyEvalScore", "attendanceScore"] }], "weekly40")).toBe(null);
});

test("the teacher's screens close what was taken off and say why; saving it is refused, the rest still saves", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  await takeOff(a, r, ["weeklyEvalScore", "homeworkScore"], [r.c._id]);
  const t = await f.signIn(r.teacher);

  const evaluation = (await t.get(`/api/weekly-evaluation/classroom/${r.c._id}?weekStart=${WEEK7}`)).body.data;
  expect(evaluation.noWeeklyEval).toBe(true);
  expect(evaluation.message).toMatch(/بقرار الإدارة/);
  const refused = await t.post("/api/weekly-evaluation/bulk", { classroomId: String(r.c._id), weekStart: WEEK7, gradesList: [{ studentId: String(r.student._id), score: 15 }] });
  expect(refused.status).toBe(400);
  expect(refused.body.message).toMatch(/التقييم الأسبوعي/);

  const week = (await t.get(`/api/coursework/classroom/${r.c._id}/week?weekStart=${WEEK7}`)).body.data;
  expect(Object.keys(week.closed).sort()).toEqual(["homeworkScore", "weeklyEvalScore"]);
  expect(week.outOf).toBe(10);
  const homework = await t.post("/api/coursework/week/bulk", { classroomId: String(r.c._id), weekStart: WEEK7, list: [{ studentId: String(r.student._id), homeworkScore: 9 }] });
  expect(homework.status).toBe(400);
  expect(homework.body.message).toMatch(/«الواجب»/);
  const conduct = await t.post("/api/coursework/week/bulk", { classroomId: String(r.c._id), weekStart: WEEK7, list: [{ studentId: String(r.student._id), attendanceScore: 9 }] });
  expect(conduct.status).toBe(200);

  // The other class, where nothing was taken off, records as ever.
  expect((await t.get(`/api/weekly-evaluation/classroom/${r.c2._id}?weekStart=${WEEK7}`)).body.data.noWeeklyEval).toBe(false);
});

test("classic: كراسة الحصة and the evaluation off make a week of 10, on the teacher's notebook and in print", async () => {
  const r = await school({});
  const a = await f.signIn(r.admin);
  expect((await takeOff(a, r, ["classworkScore", "weeklyEvalScore"], [r.c._id])).status).toBe(200);
  await ClassworkNotebook.create({ student: r.student._id, subject: r.arabic._id, classroom: r.c._id, teacher: r.teacher._id, school: r.s._id, weekStart: at(WEEK7), score: 4 });

  const t = await f.signIn(r.teacher);
  const notebook = (await t.get(`/api/classwork-notebook/classroom/${r.c._id}?weekStart=${WEEK7}`)).body.data;
  expect(notebook).toMatchObject({ closed: true, scores: {} });
  expect((await t.post("/api/classwork-notebook/bulk", { classroomId: String(r.c._id), weekStart: WEEK7, gradesList: [{ studentId: String(r.student._id), score: 5 }] })).status).toBe(400);

  const scores = await computeWeekScores(r.c._id, r.arabic._id, [r.student._id], at(WEEK7), "classic");
  expect(scores[String(r.student._id)]).toMatchObject({ classworkScore: null, outOf: 10, skipped: ["weeklyEvalScore", "classworkScore"] });

  const sheet = buildWeeklyRegisterWorkbook({ subjectName: "عربي", classroomName: "1", weekStart: at(WEEK7), students: [r.student], scores }).worksheets[0];
  const headings = [];
  sheet.eachRow((row) => row.eachCell((cell) => headings.push(String(cell.value))));
  expect(headings).toEqual(expect.arrayContaining(["تقييم أسبوعي — مترفع", "كراسة الحصة — مترفع", "الإجمالي (10)"]));
});

test("the admin's sheet, the report, the parent and the print all follow it", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  await takeOff(a, r, ["weeklyEvalScore"], [r.c._id]);
  await filed(r, WEEK7, { homework: 10, conduct: 10, evaluation: 12 });

  const sheet = (await a.get(`/api/admin-marks/week?classroom=${r.c._id}&subject=${r.arabic._id}&weekStart=${WEEK7}`)).body.data;
  expect(sheet.columns.map((c) => c.key)).toEqual(["homeworkScore", "attendanceScore"]);
  expect([sheet.total, sheet.note]).toEqual([20, expect.stringMatching(/بقرار الإدارة/)]);

  const report = (await a.get(`/api/analytics/grade-entry?period=week&date=2026-10-27`)).body;
  const cls = report.teachers[0].classes.find((c) => c.classroomId === String(r.c._id));
  expect(cls.columns.find((c) => c.key === "weekly")).toMatchObject({ applicable: false, entered: false, note: "اترفع من الرصد" });
  expect(cls.status).toBe("complete");

  const p = await f.signIn(r.parent);
  const parentWeek = (await p.get(`/api/parent/week-evaluation/${r.student._id}?weekStart=${WEEK7}`)).body.data;
  expect(parentWeek.subjects.find((s) => s.name === "لغة عربية")).toMatchObject({ score: null, skipped: true });
  // Opened without a week, it skips the week whose evaluation was taken off.
  await filed(r, "2026-10-11", { homework: 9, conduct: 9, evaluation: 17 });
  expect((await p.get(`/api/parent/week-evaluation/${r.student._id}`)).body.data.weekStart).toBe("2026-10-11");

  const scores = await computeWeekScores(r.c._id, r.arabic._id, [r.student._id], at(WEEK7), "weekly40");
  const print = buildWeek40Workbook({ subjectName: "عربي", classroomName: "1", weekStart: at(WEEK7), students: [r.student], scores }).worksheets[0];
  const cells = [];
  print.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value))));
  expect(cells).toEqual(expect.arrayContaining(["تقييم أسبوعي — مترفع", "المجموع (20)"]));
});

test("the student's أدائي shows the week out of what is left", async () => {
  const r = await future();
  await takeOff(await f.signIn(r.admin), r, ["weeklyEvalScore"], [r.c._id]);
  await filed(r, WEEK7, { homework: 9, conduct: 10, evaluation: 20 });
  const account = await f.user("student", r.s, { studentProfile: r.student._id });
  const data = (await (await f.signIn(account)).get("/api/student/performance?term=1")).body.data;
  const arabic = data.subjects.find((s) => s.subject === "لغة عربية");
  expect(arabic.weeks).toEqual([
    expect.objectContaining({ total: 19, outOf: 20, skipped: ["weeklyEvalScore"], weeklyEvalApplies: false }),
  ]);
  // Alone in its month: 19 of 20 is 38 of 40.
  expect(arabic.monthAverages.find((m) => m.schoolMonth === 2).average).toBe(38);
});

test("week 6: the evaluation put back for one class's subject records and counts there, the rest keep it off, and it closes again", async () => {
  const WEEK6 = "2026-10-18";
  const r = await future();
  const a = await f.signIn(r.admin);
  const restore = (weekStart) =>
    a.put("/api/marking-skips/restore", { weekStart, subject: String(r.arabic._id), classrooms: [String(r.c._id)], columns: ["weeklyEvalScore"] });
  const week6 = async () => (await computeWeekScores(r.c._id, r.arabic._id, [r.student._id], at(WEEK6), "weekly40"))[String(r.student._id)];
  // Filed before the week lost its evaluation in every school.
  await filed(r, WEEK6, { homework: 10, conduct: 10, evaluation: 15 });
  expect(await week6()).toMatchObject({ weeklyEvalScore: null, total: 20, outOf: 20 });

  // Only what is off in every school can come back.
  expect((await restore(WEEK7)).status).toBe(400);
  const res = await restore(WEEK6);
  expect(res.status).toBe(200);
  expect(res.body.message).toMatch(/رجع «التقييم الأسبوعي» للرصد/);
  expect((await a.get("/api/marking-skips")).body.data).toEqual([
    expect.objectContaining({ weekStart: WEEK6, columns: [], restored: [{ key: "weeklyEvalScore", label: "التقييم الأسبوعي" }], outOf: 40 }),
  ]);
  // The mark filed before counts.
  expect(await week6()).toMatchObject({ weeklyEvalScore: 15, total: 35, outOf: 40, skipped: [] });

  // The teacher records it in that class; the other class keeps it closed.
  const t = await f.signIn(r.teacher);
  expect((await t.get(`/api/weekly-evaluation/classroom/${r.c._id}?weekStart=${WEEK6}`)).body.data.noWeeklyEval).toBe(false);
  expect((await t.get(`/api/weekly-evaluation/classroom/${r.c2._id}?weekStart=${WEEK6}`)).body.data.noWeeklyEval).toBe(true);
  const saved = await t.post("/api/weekly-evaluation/bulk", { classroomId: String(r.c._id), weekStart: WEEK6, gradesList: [{ studentId: String(r.student._id), score: 18 }] });
  expect(saved.status).toBe(200);
  expect(await week6()).toMatchObject({ weeklyEvalScore: 18, total: 38 });

  const p = await f.signIn(r.parent);
  const parentWeek = (await p.get(`/api/parent/week-evaluation/${r.student._id}?weekStart=${WEEK6}`)).body.data;
  expect(parentWeek.noWeeklyEval).toBe(false);
  expect(parentWeek.subjects.find((s) => s.name === "لغة عربية")).toMatchObject({ score: 18, skipped: false });

  // Closed again, as in every school: the mark stays, uncounted.
  const doc = await MarkingSkip.findOne({ classroom: r.c._id });
  const closed = await a.del(`/api/marking-skips/${doc._id}?column=weeklyEvalScore`);
  expect(closed.body.message).toMatch(/اتقفل/);
  expect(await MarkingSkip.countDocuments({ classroom: r.c._id })).toBe(0);
  expect(await week6()).toMatchObject({ weeklyEvalScore: null, total: 20, outOf: 20 });
  expect(await WeeklyEvaluation.countDocuments({ student: r.student._id })).toBe(1);
});

test("only the school's own admins, in their own classes; a teacher can't; a week outside the year is refused", async () => {
  const r = await future();
  const other = await future();
  const stranger = await f.signIn(other.admin);
  expect((await takeOff(stranger, r, ["weeklyEvalScore"])).status).toBe(404);
  expect((await (await f.signIn(r.teacher)).get("/api/marking-skips/options")).status).toBe(403);

  const a = await f.signIn(r.admin);
  expect((await takeOff(a, r, ["weeklyEvalScore"], [r.c._id], "2025-01-05")).status).toBe(400);
  expect((await takeOff(a, r, [], [r.c._id])).status).toBe(400);
  await takeOff(a, r, ["weeklyEvalScore"], [r.c._id]);
  const doc = await MarkingSkip.findOne({ classroom: r.c._id });
  expect((await stranger.del(`/api/marking-skips/${doc._id}`)).status).toBe(404);
  expect((await stranger.get("/api/marking-skips")).body.data).toEqual([]);
});
