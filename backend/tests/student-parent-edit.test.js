require("./helpers/setup");
jest.mock("../src/utils/emailService", () => ({
  sendCredentialsEmail: jest.fn().mockResolvedValue(),
}));
const f = require("./helpers/factory");
const User = require("../src/models/User");
const Student = require("../src/models/Student");

// Editing a student also edits their parent's name and phone from the same
// form. The phone decides which parent account is meant.
let s, c, admin;
beforeEach(async () => {
  s = await f.school();
  c = await f.classroom(await f.grade(s));
  admin = await f.signIn(await f.user("admin", s));
});

const edit = (st, parent, extra) =>
  admin.put(`/api/students/${st._id}`, {
    firstName: st.firstName,
    lastName: st.lastName,
    parentFirstName: parent.firstName,
    parentLastName: parent.lastName,
    parentPhone: parent.phoneNumber,
    parentEmail: parent.email,
    ...extra,
  });

const addSibling = async (parent) => {
  const sib = await Student.create({ firstName: "Sib", lastName: "Ling", phoneNumber: parent.phoneNumber, gender: "male", grade: c.grade, classroom: c._id, school: s._id, parent: parent._id });
  await User.updateOne({ _id: parent._id }, { $addToSet: { linkedStudents: sib._id } });
  return sib;
};

test("same phone: the parent's name is saved on their account", async () => {
  const { student, parent } = await f.student(c);
  const res = await edit(student, parent, { parentFirstName: "طارق", parentLastName: "محمد عبد الوهاب" });
  expect(res.status).toBe(200);
  const after = await User.findById(parent._id);
  expect(`${after.firstName} ${after.lastName}`).toBe("طارق محمد عبد الوهاب");
});

test("another parent's phone: the student moves to that parent", async () => {
  const { student, parent } = await f.student(c);
  await addSibling(parent);
  const { parent: other } = await f.student(c);
  const res = await edit(student, parent, { parentPhone: other.phoneNumber });
  expect(res.status).toBe(200);
  expect(String((await Student.findById(student._id)).parent)).toBe(String(other._id));
  expect((await User.findById(other._id)).linkedStudents.map(String)).toContain(String(student._id));
  expect((await User.findById(parent._id)).linkedStudents.map(String)).not.toContain(String(student._id));
});

test("new phone on a shared account: the student gets their own parent, siblings untouched", async () => {
  const { student, parent } = await f.student(c);
  const sib = await addSibling(parent);
  const res = await edit(student, parent, { parentFirstName: "طارق", parentLastName: "محمد", parentPhone: "01199998888" });
  expect(res.status).toBe(200);
  expect(res.body.notice).toMatch(/حساب ولي أمر جديد/);
  const moved = await Student.findById(student._id).populate("parent");
  expect(moved.parent.phoneNumber).toBe("01199998888");
  expect(moved.parent.firstName).toBe("طارق");
  const old = await User.findById(parent._id);
  expect(old.firstName).toBe(parent.firstName);
  expect(old.phoneNumber).toBe(parent.phoneNumber);
  expect(String((await Student.findById(sib._id)).parent)).toBe(String(parent._id));
});

test("new phone, only child on the account: the number is corrected in place", async () => {
  const { student, parent } = await f.student(c);
  const res = await edit(student, parent, { parentPhone: "٠١١٩٩٩٩٧٧٧٧" });
  expect(res.status).toBe(200);
  expect((await User.findById(parent._id)).phoneNumber).toBe("01199997777");
  expect(String((await Student.findById(student._id)).parent)).toBe(String(parent._id));
});

test("a phone registered at another school is refused", async () => {
  const { student, parent } = await f.student(c);
  const s2 = await f.school();
  const { parent: foreign } = await f.student(await f.classroom(await f.grade(s2)));
  const res = await edit(student, parent, { parentPhone: foreign.phoneNumber });
  expect(res.status).toBe(400);
  expect(String((await Student.findById(student._id)).parent)).toBe(String(parent._id));
});
