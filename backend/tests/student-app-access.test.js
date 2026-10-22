require("./helpers/setup");
const f = require("./helpers/factory");
const User = require("../src/models/User");

// The platform owner's «الطلاب» on the schools page: close a student's whole
// app, or single screens of it, and close or open a whole grade's at once.
const setUp = async () => {
  const s = await f.school();
  const g = await f.grade(s, { stage: "preparatory", name: "الأول الإعدادي" });
  const c = await f.classroom(g, { name: "1/1" });
  const { student: a } = await f.student(c);
  const { student: b } = await f.student(c);
  const accountA = await f.user("student", s, { studentProfile: a._id });
  const accountB = await f.user("student", s, { studentProfile: b._id });
  const owner = await f.signIn(await f.user("admin", null, { isSuperAdmin: true, isPrimaryAdmin: false }));
  return { s, g, accountA, accountB, owner };
};

const login = (username) =>
  f.request(f.app).post("/api/auth/login").send({ username, password: f.PASSWORD });

test("the owner lists a school's students with their class, and closes one screen for one of them", async () => {
  const { s, accountA, accountB, owner } = await setUp();
  const list = await owner.get(`/api/admin/users?role=student&school=${s._id}`);
  expect(list.status).toBe(200);
  expect(list.body.data).toHaveLength(2);
  expect(list.body.data[0].profile).toEqual({ grade: expect.objectContaining({ name: "الأول الإعدادي" }), classroom: "1/1" });

  expect((await owner.put(`/api/admin/user/${accountA._id}`, { active: true, appFeatures: { grades: false } })).status).toBe(200);

  const a = await f.signIn(accountA);
  expect((await a.get("/api/student/grades")).status).toBe(403);
  expect((await a.get("/api/student/today")).status).toBe(200);
  expect((await (await f.signIn(accountB)).get("/api/student/grades")).status).toBe(200);
});

test("the owner closes and reopens the app for chosen students at once", async () => {
  const { s, accountA, accountB, owner } = await setUp();
  const close = await owner.put(`/api/admin/users/students-app-access?school=${s._id}`, { ids: [String(accountA._id)], active: false });
  expect(close.status).toBe(200);

  const refused = await login(accountA.username);
  expect(refused.status).toBe(403);
  expect(refused.body.message).toContain("موقوف");
  expect((await login(accountB.username)).status).toBe(200);

  await owner.put(`/api/admin/users/students-app-access?school=${s._id}`, { ids: [String(accountA._id)], active: true });
  expect((await login(accountA.username)).status).toBe(200);
});

test("a school's own admin can do neither", async () => {
  const { s, accountA } = await setUp();
  const admin = await f.signIn(await f.user("admin", s));
  expect((await admin.put("/api/admin/users/students-app-access", { ids: [String(accountA._id)], active: false })).status).toBe(403);

  await admin.put(`/api/admin/user/${accountA._id}`, { active: false, appFeatures: { grades: false } });
  const after = await User.findById(accountA._id);
  expect(after.active).toBe(true);
  expect(after.appFeatures.grades).toBe(true);
});
