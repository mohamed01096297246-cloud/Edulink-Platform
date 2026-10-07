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
