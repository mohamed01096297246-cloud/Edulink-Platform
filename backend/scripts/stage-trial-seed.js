// A two-stage sandbox inside Future School, for trying the stage boundary
// by hand before it goes live. Everything it creates is named TRIAL and
// lives only in Future School, which is otherwise empty — stage-trial-wipe.js
// removes exactly this and nothing else.
//
//   node scripts/stage-trial-seed.js
//   node scripts/stage-trial-wipe.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const School = require("../src/models/School");
const Grade = require("../src/models/Grade");
const Classroom = require("../src/models/Classroom");
const Student = require("../src/models/Student");
const User = require("../src/models/User");

const YEAR = "2026/2027";
const PASSWORD = "Trial12345";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const school = await School.findOne({ name: /فيوتشر/ });
  if (!school) throw new Error("مدرسة فيوتشر غير موجودة");

  const existing = await Grade.countDocuments({ school: school._id, name: /^TRIAL/ });
  if (existing) {
    console.log("بيانات التجربة موجودة بالفعل. شغّل stage-trial-wipe.js الأول.");
    await mongoose.disconnect();
    return;
  }

  const grade = async (name, stage) =>
    Grade.create({ name, academicYear: YEAR, stage, school: school._id });

  const gradeKg = await grade("TRIAL روضة أولى", "kindergarten");
  const gradePrimary = await grade("TRIAL الصف الأول الابتدائي", "primary");
  const gradePrep = await grade("TRIAL الصف الأول الإعدادي", "preparatory");

  const room = async (name, gradeDoc) =>
    Classroom.create({
      name,
      grade: gradeDoc._id,
      academicYear: YEAR,
      school: school._id,
    });

  const roomKg = await room("TRIAL فصل روضة", gradeKg);
  const roomPrimary = await room("TRIAL فصل ابتدائي", gradePrimary);
  const roomPrep = await room("TRIAL فصل إعدادي", gradePrep);

  const family = async (tag, gradeDoc, roomDoc, digits) => {
    const parent = await User.create({
      firstName: "TRIAL",
      lastName: `ولي أمر ${tag}`,
      phoneNumber: `0102000${digits}`,
      role: "parent",
      school: school._id,
      username: `trial_parent_${digits}`,
      password: PASSWORD,
    });

    const student = await Student.create({
      firstName: "TRIAL",
      lastName: `طالب ${tag}`,
      phoneNumber: `0103000${digits}`,
      gender: "male",
      grade: gradeDoc._id,
      classroom: roomDoc._id,
      parent: parent._id,
      school: school._id,
    });

    await User.updateOne(
      { _id: parent._id },
      { $set: { linkedStudents: [student._id] } },
    );
  };

  await family("روضة", gradeKg, roomKg, "111");
  await family("ابتدائي", gradePrimary, roomPrimary, "222");
  await family("إعدادي", gradePrep, roomPrep, "333");

  const teacher = async (tag, gradeDoc, digits) =>
    User.create({
      firstName: "TRIAL",
      lastName: `معلم ${tag}`,
      nationalId: `2990000000${digits}`,
      phoneNumber: `0104000${digits}`,
      role: "teacher",
      teachingGrades: [gradeDoc._id],
      school: school._id,
      username: `trial_teacher_${digits}`,
      password: PASSWORD,
    });

  await teacher("روضة", gradeKg, "111");
  await teacher("ابتدائي", gradePrimary, "222");
  await teacher("إعدادي", gradePrep, "333");

  const admin = async (tag, stages, digits, primary = false) =>
    User.create({
      firstName: "TRIAL",
      lastName: tag,
      nationalId: `2880000000${digits}`,
      phoneNumber: `0105000${digits}`,
      role: "admin",
      managedStages: stages,
      isPrimaryAdmin: primary,
      school: school._id,
      username: `trial_${tag === "المدير العام" ? "general" : stages[0]}`,
      password: PASSWORD,
    });

  await admin("المدير العام", [], "999", true);
  await admin("مدير الروضة", ["kindergarten"], "111");
  await admin("مدير الابتدائي", ["primary"], "222");
  await admin("مدير الإعدادي", ["preparatory"], "333");

  console.log(`
جاهز. الدخول على http://localhost:3000 بكلمة السر: ${PASSWORD}

  trial_general        → المدير العام (يشوف الثلاث مراحل)
  trial_kindergarten   → مدير الروضة
  trial_primary        → مدير الابتدائي
  trial_preparatory    → مدير الإعدادي

كل مرحلة فيها صف وفصل وطالب وولي أمر ومعلم.
للمسح: node scripts/stage-trial-wipe.js
`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("فشل:", err.message);
  process.exit(1);
});
