require("./helpers/setup");
const f = require("./helpers/factory");

// بيانات دخول الطلاب from the platform owner's schools page: the owner has no
// school of their own, so every call names the school (?school=id).
test("the platform owner lists a school's grades, issues student logins and reissues one", async () => {
  const s = await f.school();
  const prep = await f.grade(s, { stage: "preparatory" });
  await f.grade(s, { stage: "primary" });
  const c = await f.classroom(prep);
  const { student } = await f.student(c);
  await f.student(c);
  const owner = await f.signIn(await f.user("admin", null, { isSuperAdmin: true, isPrimaryAdmin: false }));
  const q = `?school=${s._id}`;

  expect((await owner.get("/api/student-accounts/grades")).status).toBe(400);
  const grades = await owner.get(`/api/student-accounts/grades${q}`);
  expect(grades.body.data.map((g) => String(g._id))).toEqual([String(prep._id)]);

  const issued = await owner.post(`/api/student-accounts/issue${q}`, { grade: String(prep._id) });
  expect(issued.status).toBe(201);
  expect(issued.body.data).toHaveLength(2);
  expect(issued.body.data[0]).toEqual(expect.objectContaining({ username: expect.any(String), password: expect.any(String) }));

  const list = await owner.get(`/api/student-accounts${q}&grade=${prep._id}`);
  expect(list.body.data.filter((x) => x.hasAccount)).toHaveLength(2);

  const again = await owner.post(`/api/student-accounts/${student._id}/reissue${q}`);
  expect(again.status).toBe(200);
  expect(again.body.data.password).toEqual(expect.any(String));
});
