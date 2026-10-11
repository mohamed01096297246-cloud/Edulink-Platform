require("./helpers/setup");
jest.mock("../src/utils/emailService", () => ({
  sendCredentialsEmail: jest.fn().mockResolvedValue(),
}));
const f = require("./helpers/factory");
const User = require("../src/models/User");
const Student = require("../src/models/Student");

// One family that had been registered under two parent accounts, merged:
// every child on the family account, the old account switched off and
// pointing at it. The old username and password keep working.
let s, c, family, old, oldKid;
beforeEach(async () => {
  s = await f.school();
  c = await f.classroom(await f.grade(s));
  ({ parent: family } = await f.student(c));
  ({ parent: old, student: oldKid } = await f.student(c));
});

const merge = async () => {
  await Student.updateOne({ _id: oldKid._id }, { parent: family._id });
  await User.updateOne({ _id: family._id }, { $addToSet: { linkedStudents: oldKid._id } });
  await User.updateOne({ _id: old._id }, { linkedStudents: [], active: false, mergedInto: family._id });
};

test("the old login opens the family's account with every child", async () => {
  await merge();
  const session = await f.signIn(old);
  const me = await session.get("/api/auth/me");
  expect(String(me.body.user?._id || me.body.user?.id || me.body._id)).toBe(String(family._id));
});

test("a phone already signed in to the old account carries on as the family's", async () => {
  const session = await f.signIn(old);
  await merge();
  const me = await session.get("/api/auth/me");
  expect(me.status).toBe(200);
  expect(String(me.body.user?._id || me.body.user?.id || me.body._id)).toBe(String(family._id));
});

test("a wrong password on the old account is still refused", async () => {
  await merge();
  const res = await f.request(f.app).post("/api/auth/login").send({ username: old.username, password: "wrong-pass" });
  expect(res.status).toBe(401);
});

// (Registration runs in a transaction, which the in-memory test database
// can't; editing a student takes the same phone lookup.)
test("a child given the old phone joins the family's account", async () => {
  await merge();
  const { student: other, parent: otherParent } = await f.student(c);
  const admin = await f.signIn(await f.user("admin", s));
  const res = await admin.put(`/api/students/${other._id}`, {
    firstName: other.firstName, lastName: other.lastName,
    parentFirstName: otherParent.firstName, parentLastName: otherParent.lastName,
    parentPhone: old.phoneNumber, parentEmail: "",
  });
  expect(res.status).toBe(200);
  expect(String((await Student.findById(other._id)).parent)).toBe(String(family._id));
});

