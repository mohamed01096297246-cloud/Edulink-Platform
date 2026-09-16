// Restores the demo accounts given to Google Play reviewers under
// "App access" — they must always be able to log in and see a working app,
// or the release can be rejected.
//
//   parent  01000000000 / EduLinkDemo2026!
//   teacher 01000000002 / EduLinkDemo2026!
//
// Everything lives in its own clearly-labelled classroom with its own
// fictional student. The earlier demo was wired into a real classroom and a
// real child, which put a fake teacher into real families' timetables and
// showed a real child's records to outside reviewers — and it broke the
// moment that real child's record changed.
//
// Idempotent: finds-or-creates each piece and resets the two passwords.
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Student = require("../src/models/Student");
const Classroom = require("../src/models/Classroom");
const Grade = require("../src/models/Grade");
const Subject = require("../src/models/Subject");
const Schedule = require("../src/models/Schedule");
const BellSchedule = require("../src/models/BellSchedule");
const { findBellFor, slotFor } = require("../src/utils/periods");

const SCHOOL_NAME = "مدرسة الرحمة الابتدائية الخاصة";
const GRADE_NAME = "الصف الاول الابتدائي";
const SUBJECT_NAME = /لغة عربي/;
const CLASSROOM_NAME = "فصل تجريبي - مراجعة Google Play";
const PASSWORD = "EduLinkDemo2026!";
const DAYS = ["sun", "mon", "tue", "wed", "thu"];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const School = require("../src/models/School");

  const school = await School.findOne({ name: SCHOOL_NAME });
  const grade = await Grade.findOne({ name: GRADE_NAME, school: school._id });
  const subject = await Subject.findOne({ school: school._id, name: SUBJECT_NAME });
  if (!school || !grade || !subject) throw new Error("school, grade or subject not found");

  let classroom = await Classroom.findOne({ name: CLASSROOM_NAME, school: school._id });
  if (!classroom) {
    classroom = await Classroom.create({
      name: CLASSROOM_NAME,
      grade: grade._id,
      capacity: 5,
      academicYear: grade.academicYear,
      school: school._id,
    });
    console.log("created classroom");
  }

  // Parent
  let parent = await User.findOne({ username: "01000000000", role: "parent" });
  if (!parent) {
    parent = new User({
      firstName: "Demo",
      lastName: "Parent",
      username: "01000000000",
      phoneNumber: "01000000000",
      email: "mohamed01096297246+demo@gmail.com",
      role: "parent",
      school: school._id,
      active: true,
    });
    console.log("created parent");
  }
  parent.password = PASSWORD;
  parent.active = true;
  await parent.save();

  // Teacher
  let teacher = await User.findOne({ username: "01000000002", role: "teacher" });
  if (!teacher) {
    teacher = new User({
      firstName: "Demo",
      lastName: "Teacher",
      username: "01000000002",
      phoneNumber: "01000000002",
      nationalId: "29001010100002",
      email: "mohamed01096297246+demoteacher@gmail.com",
      role: "teacher",
      school: school._id,
      active: true,
    });
    console.log("created teacher");
  }
  teacher.subjects = [subject._id];
  teacher.teachingGrades = [grade._id];
  teacher.password = PASSWORD;
  teacher.active = true;
  await teacher.save();

  // Fictional student, only ever in the demo classroom.
  let student = await Student.findOne({ parent: parent._id, classroom: classroom._id });
  if (!student) {
    student = await Student.create({
      firstName: "طالب",
      lastName: "تجريبي",
      phoneNumber: "01000000000",
      gender: "male",
      grade: grade._id,
      classroom: classroom._id,
      parent: parent._id,
      school: school._id,
    });
    console.log("created student");
  }
  await User.updateOne({ _id: parent._id }, { $addToSet: { linkedStudents: student._id } });
  await Classroom.updateOne(
    { _id: classroom._id },
    { $set: { currentStudents: await Student.countDocuments({ classroom: classroom._id }) } },
  );

  // First period every school day, so a reviewer sees a lesson whichever
  // weekday they open the app on.
  const bells = await BellSchedule.find({ school: school._id }).lean();
  const times = [];
  for (const day of DAYS) {
    const slot = slotFor(findBellFor(bells, grade._id, day), 1);
    if (!slot) throw new Error(`no bell schedule gives ${GRADE_NAME} a 1st period on ${day}`);
    times.push(`${day} ${slot.startTime}-${slot.endTime}`);

    const exists = await Schedule.findOne({ classroom: classroom._id, day, period: 1 });
    if (!exists) {
      await Schedule.create({
        teacher: teacher._id,
        subject: subject._id,
        classroom: classroom._id,
        day,
        period: 1,
        startTime: slot.startTime,
        endTime: slot.endTime,
        school: school._id,
      });
    }
  }

  console.log(`\nclassroom: ${classroom.name}`);
  console.log(`parent  01000000000 -> child ${student.firstName} ${student.lastName}`);
  console.log(`teacher 01000000002 -> ${subject.name}, period 1: ${times.join(", ")}`);
  console.log(`schedules in demo classroom: ${await Schedule.countDocuments({ classroom: classroom._id })}`);

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("seed failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
