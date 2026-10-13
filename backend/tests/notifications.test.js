require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");

test("the notifications log names who sent each notice", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const admin = await f.user("admin", s, { firstName: "Mona", lastName: "Admin" });
  const teacher = await f.user("teacher", s, { firstName: "Sara", lastName: "Teacher", subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  await f.student(c);

  const t = await f.signIn(teacher);
  expect((await t.post("/api/notifications", { title: "From teacher", message: "m", target: "all" })).status).toBe(201);
  const a = await f.signIn(admin);
  expect((await a.post("/api/notifications", { title: "From admin", message: "m", target: "all" })).status).toBe(201);

  const log = (await a.get("/api/notifications")).body;
  const byTitle = Object.fromEntries(log.map((n) => [n.title, n.createdBy]));
  expect(byTitle["From teacher"]).toMatchObject({ firstName: "Sara", lastName: "Teacher", role: "teacher" });
  expect(byTitle["From admin"]).toMatchObject({ firstName: "Mona", role: "admin" });
});

// Tapping a notice in the parent app opens the page it came from, for the
// child it's about — so a class-wide notice (new homework) names the child.
test("a new-homework notice tells the parent which child it is about", async () => {
  const Notification = require("../src/models/Notification");
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student, parent } = await f.student(c);

  const created = await (await f.signIn(teacher)).post("/api/homework", { title: "ص 3", pageNumber: "3", grade: String(g._id), classroomId: String(c._id) });
  expect(created.status).toBe(201);

  // The notice is sent after the response, without holding it up.
  let notice = null;
  for (let i = 0; i < 50 && !notice; i += 1) {
    notice = await Notification.findOne({ parent: parent._id, type: "homework" });
    if (!notice) await new Promise((r) => setTimeout(r, 20));
  }
  expect(notice).toBeTruthy();

  const feed = (await (await f.signIn(parent)).get("/api/notifications/parent")).body;
  const item = feed.find((n) => n.type === "homework");
  expect(String(item.student)).toBe(String(student._id));
});
