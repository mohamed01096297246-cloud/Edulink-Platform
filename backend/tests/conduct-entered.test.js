require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const Attendance = require("../src/models/Attendance");

// A classic school that moves مواظبة وسلوك to the teacher's hand from one
// week on: that week and after count only what the teacher entered, the
// weeks before keep the mark the attendance register gave them.
const BEFORE = "2026-09-27";
const FROM = "2026-10-04";

const setUp = async () => {
  const s = await f.school({ conductEnteredFrom: new Date(`${FROM}T00:00:00.000Z`) });
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const admin = await f.user("admin", s);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const lesson = await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "mon", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  // Absent the Monday of each week: half the lessons attended.
  for (const day of ["2026-09-28", "2026-09-29", "2026-10-05", "2026-10-06"]) {
    await Attendance.create({
      student: student._id,
      date: new Date(`${day}T00:00:00.000Z`),
      status: day.endsWith("28") || day.endsWith("05") ? "absent" : "present",
      schedule: lesson._id,
      subject: sub._id,
      recordedBy: teacher._id,
      school: s._id,
    });
  }
  return { s, c, admin, teacher, student };
};

const weekOf = async (session, c, week) =>
  (await session.get(`/api/coursework/classroom/${c._id}/week?weekStart=${week}`)).body.data;

test("from the switch-over week attendance no longer sets the mark; earlier weeks keep theirs", async () => {
  const { c, teacher, student } = await setUp();
  const t = await f.signIn(teacher);

  const before = await weekOf(t, c, BEFORE);
  expect(before.conductEntered).toBe(false);
  // Half the lessons: 0.5 × 3 + 2.
  expect(before.students[0].attendanceScore).toBe(3.5);

  const after = await weekOf(t, c, FROM);
  expect(after.conductEntered).toBe(true);
  expect(after.students[0].attendanceScore).toBeNull();

  const saved = await t.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: FROM,
    list: [{ studentId: String(student._id), attendanceScore: 4 }],
  });
  expect(saved.status).toBe(200);
  expect((await weekOf(t, c, FROM)).students[0].attendanceScore).toBe(4);
  // The week before is untouched.
  expect((await weekOf(t, c, BEFORE)).students[0].attendanceScore).toBe(3.5);
});

test("the teacher's mark is a whole number within the column's maximum", async () => {
  const { c, teacher, student } = await setUp();
  const t = await f.signIn(teacher);
  for (const attendanceScore of [3.5, 6]) {
    const res = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart: FROM,
      list: [{ studentId: String(student._id), attendanceScore }],
    });
    expect(res.status).toBe(400);
  }
});

test("the teacher's app is told to show the مواظبة وسلوك screen", async () => {
  const { teacher } = await setUp();
  const res = await f.request(f.app).post("/api/auth/login").send({ username: teacher.username, password: f.PASSWORD });
  expect(res.body.user.conductEntered).toBe(true);
  const me = await (await f.signIn(teacher)).get("/api/auth/me");
  expect(me.body.user.conductEntered).toBe(true);
});

test("the grade-entry report counts مواظبة وسلوك as the teacher's to record", async () => {
  const { c, admin, teacher, student } = await setUp();
  const a = await f.signIn(admin);
  const columnOf = async (date) => {
    const res = await a.get(`/api/analytics/grade-entry?period=week&date=${date}`);
    expect(res.status).toBe(200);
    return res.body.teachers[0].classes[0].columns;
  };

  // Every week, the switch-over's or not: the teacher's mark alone counts,
  // never the attendance register.
  const before = await columnOf("2026-09-29");
  expect(before.map((x) => x.key)).not.toContain("attendance");
  expect(before.find((x) => x.key === "conduct")).toMatchObject({ entered: true, students: 0 });

  let after = await columnOf("2026-10-06");
  let conduct = after.find((x) => x.key === "conduct");
  expect(conduct).toMatchObject({ label: "مواظبة وسلوك", entered: true, students: 0 });
  expect(after.find((x) => x.key === "attendance")).toBeUndefined();

  const saved = await (await f.signIn(teacher)).post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: FROM,
    list: [{ studentId: String(student._id), attendanceScore: 5 }],
  });
  expect(saved.status).toBe(200);
  after = await columnOf("2026-10-06");
  conduct = after.find((x) => x.key === "conduct");
  expect(conduct).toMatchObject({ students: 1, full: true });
});
