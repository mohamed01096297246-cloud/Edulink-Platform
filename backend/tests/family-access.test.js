require("./helpers/setup");
const f = require("./helpers/factory");
const User = require("../src/models/User");
const Student = require("../src/models/Student");

// From the schools page the platform owner links a school's students to their
// parents and hands parents their login details.
const setUp = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const owner = await f.user("admin", null, { isSuperAdmin: true, isPrimaryAdmin: false });
  const one = await f.student(c);
  const two = await f.student(c);
  return { s, c, owner, one, two, base: `/api/schools/${s._id}/families` };
};

const loginWorks = async (username, password) =>
  (await f.request(f.app).post("/api/auth/login").send({ username, password })).status === 200;

test("lists every student with the parent account they belong to", async () => {
  const { owner, one, two, base } = await setUp();
  const res = await (await f.signIn(owner)).get(base);
  expect(res.status).toBe(200);
  const byId = Object.fromEntries(res.body.data.students.map((s) => [String(s._id), s]));
  expect(byId[one.student._id].parent).toMatchObject({ username: one.parent.username, children: 1 });
  expect(byId[two.student._id].parent.username).toBe(two.parent.username);
});

test("links a student to a sibling's parent found by phone, typed in Arabic digits", async () => {
  const { owner, one, two, base } = await setUp();
  const o = await f.signIn(owner);
  const arabic = one.parent.phoneNumber.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

  const look = await o.get(`${base}/parent?phone=${encodeURIComponent(arabic)}`);
  expect(look.body.data.parent).toMatchObject({ username: one.parent.username });

  const res = await o.post(`${base}/${two.student._id}/link`, { phone: arabic });
  expect(res.status).toBe(200);
  expect(res.body.data.credentials).toBeNull();
  expect(res.body.data.previous).toMatchObject({ username: two.parent.username, childrenLeft: 0 });

  expect(String((await Student.findById(two.student._id)).parent)).toBe(String(one.parent._id));
  const linked = (await User.findById(one.parent._id)).linkedStudents.map(String);
  expect(linked).toEqual(expect.arrayContaining([String(one.student._id), String(two.student._id)]));
  expect((await User.findById(two.parent._id)).linkedStudents.map(String)).not.toContain(String(two.student._id));

  // The parent now sees both children.
  const dash = await (await f.signIn(one.parent)).get("/api/parent/dashboard");
  expect(dash.body.children).toHaveLength(2);
});

test("a phone with no account gets a new parent account whose login works once handed out", async () => {
  const { owner, one, base } = await setUp();
  const res = await (await f.signIn(owner)).post(`${base}/${one.student._id}/link`, {
    phone: "01599887766",
    firstName: "محمد",
    lastName: "علي",
  });
  expect(res.status).toBe(200);
  const { username, password } = res.body.data.credentials;
  expect(username).toBe("01599887766");
  expect(await loginWorks(username, password)).toBe(true);
  expect(String((await Student.findById(one.student._id)).parent)).toBe(String(res.body.data.parent._id));

  // A new account needs a name.
  const unnamed = await (await f.signIn(owner)).post(`${base}/${one.student._id}/link`, { phone: "01599887755" });
  expect(unnamed.status).toBe(400);
});

test("a new password replaces the old one; a merged account's family account is the one changed", async () => {
  const { owner, one, two, base } = await setUp();
  const o = await f.signIn(owner);

  const res = await o.post(`${base}/parents/${one.parent._id}/reissue`);
  expect(res.status).toBe(200);
  const { username, password } = res.body.data.credentials;
  expect(username).toBe(one.parent.username);
  expect(await loginWorks(username, password)).toBe(true);
  expect(await loginWorks(username, f.PASSWORD)).toBe(false);

  await User.updateOne({ _id: two.parent._id }, { $set: { mergedInto: one.parent._id, active: false } });
  const merged = await o.post(`${base}/parents/${two.parent._id}/reissue`);
  expect(merged.body.data.credentials.username).toBe(one.parent.username);
});

test("a student who isn't the parent's child is taken off the account, then linked to the right one", async () => {
  const { owner, one, two, base } = await setUp();
  const o = await f.signIn(owner);
  // Put two's student under one's parent by mistake, then take it off.
  await o.post(`${base}/${two.student._id}/link`, { phone: one.parent.phoneNumber });

  const res = await o.post(`${base}/${two.student._id}/unlink`);
  expect(res.status).toBe(200);
  expect(res.body.data.previous).toMatchObject({ username: one.parent.username, childrenLeft: 1 });
  expect((await Student.findById(two.student._id)).parent).toBeNull();
  expect((await User.findById(one.parent._id)).linkedStudents.map(String)).not.toContain(String(two.student._id));

  // The parent sees only their own child, and is refused the other one.
  const p = await f.signIn(one.parent);
  expect((await p.get("/api/parent/dashboard")).body.children).toHaveLength(1);
  expect((await p.get(`/api/homework-results/dashboard/${two.student._id}`)).status).toBe(403);

  // Listed without a parent; unlinking again is refused.
  const listed = (await o.get(base)).body.data.students.find((s) => String(s._id) === String(two.student._id));
  expect(listed.parent).toBeNull();
  expect((await o.post(`${base}/${two.student._id}/unlink`)).status).toBe(400);

  // The school's own admin can give them a parent from the student form.
  const schoolAdmin = await f.user("admin", one.student.school ? { _id: one.student.school } : null);
  const edit = await (await f.signIn(schoolAdmin)).put(`/api/students/${two.student._id}`, { parentPhone: two.parent.phoneNumber });
  expect(edit.status).toBe(200);
  expect(String((await Student.findById(two.student._id)).parent)).toBe(String(two.parent._id));
  expect((await User.findById(two.parent._id)).linkedStudents.map(String)).toContain(String(two.student._id));
});

test("only the platform owner, and only within the school", async () => {
  const { s, one, two, base } = await setUp();
  const schoolAdmin = await f.user("admin", s);
  const a = await f.signIn(schoolAdmin);
  expect((await a.get(base)).status).toBe(403);
  expect((await a.post(`${base}/parents/${one.parent._id}/reissue`)).status).toBe(403);

  // Another school's parent can't be linked here, nor its student reached.
  const other = await f.school();
  const og = await f.grade(other);
  const oc = await f.classroom(og);
  const stranger = await f.student(oc);
  const owner = await f.user("admin", null, { isSuperAdmin: true, isPrimaryAdmin: false });
  const o = await f.signIn(owner);
  expect((await o.post(`${base}/${two.student._id}/link`, { phone: stranger.parent.phoneNumber })).status).toBe(400);
  expect((await o.post(`${base}/${stranger.student._id}/link`, { phone: one.parent.phoneNumber })).status).toBe(404);
  expect((await o.post(`${base}/parents/${stranger.parent._id}/reissue`)).status).toBe(404);
});
