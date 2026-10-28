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

// The app before 2026-10-17 sent only the students whose shown mark the
// teacher changed. Saving a week before the switch-over records the rest of
// the class who were shown the full mark; anyone shown less is left to the
// teacher.
test("a save before the switch-over records the rest of the class shown the full mark", async () => {
  const { s, c, teacher, student: halfway } = await setUp();
  const lesson = await Schedule.findOne({ classroom: c._id });
  const { student: always } = await f.student(c);
  const { student: never } = await f.student(c);
  const { student: unmarked } = await f.student(c);
  for (const [who, status] of [[always, "present"], [never, "absent"]]) {
    for (const day of ["2026-09-28", "2026-09-29"]) {
      await Attendance.create({
        student: who._id,
        date: new Date(`${day}T00:00:00.000Z`),
        status,
        schedule: lesson._id,
        subject: lesson.subject,
        recordedBy: teacher._id,
        school: s._id,
      });
    }
  }
  const t = await f.signIn(teacher);
  const conductOf = async (week) =>
    Object.fromEntries(
      (await weekOf(t, c, week)).students.map((x) => [x.studentId, [x.attendanceScore, x.overridden.attendanceScore]]),
    );

  // Shown: halfway 3.5, always 5, never 2, unmarked nothing. The old app
  // sends only halfway, changed to 4.
  const saved = await t.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: BEFORE,
    list: [{ studentId: String(halfway._id), attendanceScore: 4 }],
  });
  expect(saved.status).toBe(200);
  const before = await conductOf(BEFORE);
  expect(before[String(halfway._id)]).toEqual([4, true]);
  expect(before[String(always._id)]).toEqual([5, true]);
  expect(before[String(never._id)]).toEqual([2, false]);
  expect(before[String(unmarked._id)]).toEqual([null, false]);

  // From the switch-over on nothing is worked out, so nothing is added.
  await t.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: FROM,
    list: [{ studentId: String(halfway._id), attendanceScore: 4 }],
  });
  const after = await conductOf(FROM);
  expect(after[String(always._id)]).toEqual([null, false]);

  // A homework mark alone records no مواظبة.
  await t.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: "2026-09-20",
    list: [{ studentId: String(halfway._id), homeworkScore: 3 }],
  });
  expect((await conductOf("2026-09-20"))[String(always._id)][1]).toBe(false);
});

test("a school still on attendance keeps its worked-out marks unrecorded", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const lesson = await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "mon", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student: a } = await f.student(c);
  const { student: b } = await f.student(c);
  await Attendance.create({ student: b._id, date: new Date("2026-09-28T00:00:00.000Z"), status: "present", schedule: lesson._id, subject: sub._id, recordedBy: teacher._id, school: s._id });
  const t = await f.signIn(teacher);
  await t.post("/api/coursework/week/bulk", { classroomId: String(c._id), weekStart: BEFORE, list: [{ studentId: String(a._id), attendanceScore: 4 }] });
  const week = await weekOf(t, c, BEFORE);
  const other = week.students.find((x) => x.studentId === String(b._id));
  expect(other).toMatchObject({ attendanceScore: 5, overridden: { attendanceScore: false } });
});

test("the teacher's mark is any number within the column's maximum", async () => {
  const { c, teacher, student } = await setUp();
  const t = await f.signIn(teacher);
  const save = (attendanceScore) =>
    t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart: FROM,
      list: [{ studentId: String(student._id), attendanceScore }],
    });
  for (const attendanceScore of [6, 5.25, -1]) {
    expect((await save(attendanceScore)).status).toBe(400);
  }
  for (const attendanceScore of [3.5, 4.25, 2.75, 3.3]) {
    expect((await save(attendanceScore)).status).toBe(200);
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
