require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const ClassAssignment = require("../src/models/ClassAssignment");
const WeeklyEvaluation = require("../src/models/WeeklyEvaluation");
const ClassworkNotebook = require("../src/models/ClassworkNotebook");
const CourseworkOverride = require("../src/models/CourseworkOverride");
const MonthlyGrade = require("../src/models/MonthlyGrade");
const { recordedWeeks, computeWeekScores } = require("../src/utils/weekScores");

// A pupil moved to another class of the same grade takes their marks along
// (Mohamed, 2026-11-24) — but only into weeks the new class has recorded
// itself; the rest wait and join when it records them (utils/classMoves.js).

const realFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => "" }));
});
afterEach(() => {
  global.fetch = realFetch;
});

const W2 = "2026-09-20";
const W3 = "2026-09-27";
const at = (iso) => new Date(`${iso}T00:00:00Z`);

const setup = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const g2 = await f.grade(s);
  const c1 = await f.classroom(g);
  const c2 = await f.classroom(g);
  const other = await f.classroom(g2);
  const arabic = await f.subject(s, [g, g2], { name: "لغة عربيه" });
  const teach = async (room) => {
    const t = await f.user("teacher", s, { subjects: [arabic._id], teachingGrades: [g._id, g2._id] });
    await ClassAssignment.create({ school: s._id, teacher: t._id, classroom: room._id, subject: arabic._id });
    await Schedule.create({ school: s._id, classroom: room._id, subject: arabic._id, teacher: t._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
    return t;
  };
  const t1 = await teach(c1);
  const t2 = await teach(c2);
  const admin = await f.user("admin", s);
  const moved = (await f.student(c1)).student;
  const stay1 = (await f.student(c1)).student;
  const stay2 = (await f.student(c2)).student;

  const owner = (room, teacher) => ({ subject: arabic._id, classroom: room._id, teacher: teacher._id, school: s._id });
  // c1 recorded weeks 2 and 3 and October's test; c2 only week 2 and the test.
  for (const pupil of [moved, stay1]) {
    await WeeklyEvaluation.create({ ...owner(c1, t1), student: pupil._id, weekStart: at(W2), score: 8 });
    await WeeklyEvaluation.create({ ...owner(c1, t1), student: pupil._id, weekStart: at(W3), score: 9 });
  }
  await ClassworkNotebook.create({ ...owner(c1, t1), student: moved._id, weekStart: at(W2), score: 4 });
  await CourseworkOverride.create({ ...owner(c1, t1), student: moved._id, weekStart: at(W2), homeworkScore: 5 });
  await MonthlyGrade.create({ ...owner(c1, t1), student: moved._id, month: 10, year: 2026, grade: 13 });
  await WeeklyEvaluation.create({ ...owner(c2, t2), student: stay2._id, weekStart: at(W2), score: 7 });
  await MonthlyGrade.create({ ...owner(c2, t2), student: stay2._id, month: 10, year: 2026, grade: 11 });

  return { s, g, g2, c1, c2, other, arabic, t1, t2, admin, moved, stay1, stay2 };
};

const classOf = async (Model, where) => String((await Model.findOne(where).lean()).classroom);

test("moving a pupil to another class of the grade takes the marks of the weeks it has recorded; the rest wait", async () => {
  const r = await setup();
  const before = await WeeklyEvaluation.findOne({ student: r.moved._id, weekStart: at(W2) }).lean();
  const a = await f.signIn(r.admin);

  const res = await a.put(`/api/students/${r.moved._id}`, { grade: String(r.g._id), classroom: String(r.c2._id) });
  expect(res.status).toBe(200);
  expect(res.body.notice).toMatch(/اتنقلت درجات الطالب معاه لفصل .* \(4 درجة\)/);
  expect(res.body.notice).toMatch(/1 درجة .*هتنضم/);

  const mine = { student: r.moved._id, subject: r.arabic._id };
  expect(await classOf(WeeklyEvaluation, { ...mine, weekStart: at(W2) })).toBe(String(r.c2._id));
  expect(await classOf(ClassworkNotebook, { ...mine, weekStart: at(W2) })).toBe(String(r.c2._id));
  expect(await classOf(CourseworkOverride, { ...mine, weekStart: at(W2) })).toBe(String(r.c2._id));
  expect(await classOf(MonthlyGrade, { ...mine, month: 10 })).toBe(String(r.c2._id));
  // Week 3 isn't on c2's register yet: it waits in c1.
  expect(await classOf(WeeklyEvaluation, { ...mine, weekStart: at(W3) })).toBe(String(r.c1._id));

  // The mark keeps who entered it and when.
  const after = await WeeklyEvaluation.findOne({ student: r.moved._id, weekStart: at(W2) }).lean();
  expect(String(after.teacher)).toBe(String(r.t1._id));
  expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

  // c2's register shows the pupil's week 2, and gains no week 3 of its own.
  expect((await recordedWeeks(r.c2._id, r.arabic._id, { $exists: true })).map((d) => d.toISOString().slice(0, 10))).toEqual([W2]);
  const week = (await computeWeekScores(r.c2._id, r.arabic._id, [r.moved._id], at(W2)))[String(r.moved._id)];
  expect(week).toMatchObject({ weeklyEvalScore: 8, classworkScore: 4, homeworkScore: 5 });
});

test("the old class's teacher can't file a moved pupil's mark back, or clear it", async () => {
  const r = await setup();
  const a = await f.signIn(r.admin);
  await a.put(`/api/students/${r.moved._id}`, { grade: String(r.g._id), classroom: String(r.c2._id) });
  const t1 = await f.signIn(r.t1);

  // A screen loaded before the move still has the pupil: dropped, the rest saved.
  const res = await t1.post("/api/weekly-evaluation/bulk", {
    classroomId: String(r.c1._id),
    weekStart: W2,
    gradesList: [{ studentId: String(r.moved._id), score: 2 }, { studentId: String(r.stay1._id), score: 6 }],
  });
  expect(res.status).toBe(200);
  const mark = await WeeklyEvaluation.findOne({ student: r.moved._id, weekStart: at(W2) }).lean();
  expect(mark).toMatchObject({ score: 8 });
  expect(String(mark.classroom)).toBe(String(r.c2._id));
  expect((await WeeklyEvaluation.findOne({ student: r.stay1._id, weekStart: at(W2) }).lean()).score).toBe(6);

  // Only the moved pupil: nothing to save.
  const alone = await t1.post("/api/weekly-evaluation/bulk", {
    classroomId: String(r.c1._id),
    weekStart: W2,
    gradesList: [{ studentId: String(r.moved._id), score: 2 }],
  });
  expect(alone.status).toBe(400);

  // Nor clear it from the week sheet, nor file a monthly test or classwork.
  const sheet = await t1.post("/api/coursework/week/bulk", {
    classroomId: String(r.c1._id),
    weekStart: W2,
    list: [{ studentId: String(r.moved._id), classworkScore: null }, { studentId: String(r.stay1._id), homeworkScore: 4 }],
  });
  expect(sheet.status).toBe(200);
  expect(await ClassworkNotebook.findOne({ student: r.moved._id, weekStart: at(W2) }).lean()).toMatchObject({ score: 4 });
  const monthly = await t1.post("/api/monthly-grades/bulk", {
    classroomId: String(r.c1._id),
    month: 10,
    gradesList: [{ studentId: String(r.moved._id), grade: 1 }, { studentId: String(r.stay1._id), grade: 12 }],
  });
  expect(monthly.status).toBe(200);
  expect(await MonthlyGrade.findOne({ student: r.moved._id, month: 10 }).lean()).toMatchObject({ grade: 13 });
  const classwork = await t1.post("/api/classwork-notebook/bulk", {
    classroomId: String(r.c1._id),
    weekStart: W2,
    gradesList: [{ studentId: String(r.moved._id), score: 1 }],
  });
  expect(classwork.status).toBe(400);
});

test("a waiting week joins the new class as soon as its teacher records it", async () => {
  const r = await setup();
  const a = await f.signIn(r.admin);
  await a.put(`/api/students/${r.moved._id}`, { grade: String(r.g._id), classroom: String(r.c2._id) });
  const t2 = await f.signIn(r.t2);

  // The new teacher records week 3 for the others, leaving the moved pupil blank.
  const res = await t2.post("/api/weekly-evaluation/bulk", {
    classroomId: String(r.c2._id),
    weekStart: W3,
    gradesList: [{ studentId: String(r.stay2._id), score: 7 }],
  });
  expect(res.status).toBe(200);
  const mark = await WeeklyEvaluation.findOne({ student: r.moved._id, weekStart: at(W3) }).lean();
  expect(mark).toMatchObject({ score: 9 });
  expect(String(mark.classroom)).toBe(String(r.c2._id));
  // c1's pupil keeps their own week 3 in c1.
  expect(await classOf(WeeklyEvaluation, { student: r.stay1._id, weekStart: at(W3) })).toBe(String(r.c1._id));
});

test("a move to another grade leaves the marks where they are", async () => {
  const r = await setup();
  const a = await f.signIn(r.admin);
  const res = await a.put(`/api/students/${r.moved._id}`, { grade: String(r.g2._id), classroom: String(r.other._id) });
  expect(res.status).toBe(200);
  expect(res.body.notice).toBeUndefined();
  expect(await WeeklyEvaluation.countDocuments({ student: r.moved._id, classroom: r.c1._id })).toBe(2);
  expect(await MonthlyGrade.countDocuments({ student: r.moved._id, classroom: r.c1._id })).toBe(1);
});
