require("./helpers/setup");
const f = require("./helpers/factory");
const Homework = require("../src/models/Homework");
const Schedule = require("../src/models/Schedule");

// Homework is set without a mark; the teacher gives each student the week's
// الواجب mark directly, the same way as كراسة الحصة.
test("the week's homework mark is entered per student and read back for that week", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student: a } = await f.student(c);
  const { student: b } = await f.student(c);
  const session = await f.signIn(teacher);

  // A homework published this week, with no mark.
  const created = await session.post("/api/homework", { title: "ص 12", pageNumber: "12", grade: String(g._id), classroomId: String(c._id) });
  expect(created.status).toBe(201);
  expect((await Homework.findOne({ classroom: c._id })).totalMarks ?? null).toBeNull();

  const week = new Date().toISOString().slice(0, 10);
  const saved = await session.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: week,
    list: [{ studentId: String(a._id), homeworkScore: 4 }],
  });
  expect(saved.status).toBe(200);

  const res = await session.get(`/api/coursework/classroom/${c._id}/week?weekStart=${week}`);
  expect(res.status).toBe(200);
  const byId = Object.fromEntries(res.body.data.students.map((st) => [String(st.studentId), st]));
  expect(byId[a._id].homeworkScore).toBe(4);
  // No mark given yet: empty, not zero — even though homework was set.
  expect(byId[b._id].homeworkScore).toBeNull();
  expect(res.body.data.maxScores.homeworkScore).toBe(5);
});

test("a homework mark above the scheme's maximum is refused", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  const res = await (await f.signIn(teacher)).post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: new Date().toISOString().slice(0, 10),
    list: [{ studentId: String(student._id), homeworkScore: 7 }],
  });
  expect(res.status).toBe(400);
});
