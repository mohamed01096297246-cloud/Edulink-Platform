// Builders for the records a test needs, with only the fields that matter
// to it spelled out. Every user's password is PASSWORD, so a test can sign
// in through the real login route and get a real token.
const request = require("supertest");
const app = require("../../app");
const School = require("../../src/models/School");
const Grade = require("../../src/models/Grade");
const Classroom = require("../../src/models/Classroom");
const Subject = require("../../src/models/Subject");
const User = require("../../src/models/User");
const Student = require("../../src/models/Student");

const PASSWORD = "Pass12345";
let seq = 0;
const next = () => {
  seq += 1;
  return seq;
};

const school = (extra = {}) => {
  const n = next();
  return School.create({ name: `School ${n}`, code: `S${n}`, active: true, ...extra });
};

const grade = (schoolDoc, extra = {}) =>
  Grade.create({ name: `Grade ${next()}`, academicYear: "2026/2027", school: schoolDoc._id, ...extra });

const classroom = (gradeDoc, extra = {}) =>
  Classroom.create({
    name: `Class ${next()}`,
    grade: gradeDoc._id,
    academicYear: "2026/2027",
    school: gradeDoc.school,
    ...extra,
  });

const subject = (schoolDoc, grades, extra = {}) => {
  const n = next();
  return Subject.create({
    name: `Subject ${n}`,
    code: `SUB${n}`,
    grades: grades.map((g) => g._id),
    school: schoolDoc._id,
    ...extra,
  });
};

// A phone that is unique per call, in the stored 11-digit form.
const phone = () => `010${String(10000000 + next()).slice(-8)}`;

const user = (role, schoolDoc, extra = {}) => {
  const n = next();
  return User.create({
    firstName: role,
    lastName: `#${n}`,
    role,
    username: `${role}_${n}`,
    password: PASSWORD,
    school: schoolDoc?._id,
    phoneNumber: phone(),
    nationalId: `2990000${String(1000000 + n).slice(-7)}`,
    email: `${role}${n}@example.com`,
    ...(role === "admin" ? { isPrimaryAdmin: true } : {}),
    ...extra,
  });
};

// A student with a parent account linked both ways, as registration makes them.
const student = async (classroomDoc, extra = {}) => {
  const schoolDoc = { _id: classroomDoc.school };
  const parent = await user("parent", schoolDoc);
  const s = await Student.create({
    firstName: `Student`,
    lastName: `#${next()}`,
    phoneNumber: parent.phoneNumber,
    gender: "male",
    grade: classroomDoc.grade,
    classroom: classroomDoc._id,
    school: classroomDoc.school,
    parent: parent._id,
    ...extra,
  });
  parent.linkedStudents = [s._id];
  await parent.save();
  return { student: s, parent };
};

// Signs in through POST /api/auth/login and returns a request helper that
// carries the token.
const signIn = async (userDoc, username = userDoc.username) => {
  const res = await request(app).post("/api/auth/login").send({ username, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  const auth = (r) => r.set("Authorization", `Bearer ${res.body.token}`);
  return {
    token: res.body.token,
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    del: (url) => auth(request(app).delete(url)),
  };
};

module.exports = { PASSWORD, school, grade, classroom, subject, user, student, signIn, app, request };
