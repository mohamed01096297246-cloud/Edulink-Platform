// Removes the sandbox stage-trial-seed.js created, plus anything added by
// hand while trying it out. Scoped to Future School and to records named
// TRIAL, so it can never reach a real school's data.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const School = require("../src/models/School");
const Grade = require("../src/models/Grade");
const Classroom = require("../src/models/Classroom");
const Student = require("../src/models/Student");
const User = require("../src/models/User");
const Schedule = require("../src/models/Schedule");
const Notification = require("../src/models/Notification");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const school = await School.findOne({ name: /فيوتشر/ });
  if (!school) throw new Error("مدرسة فيوتشر غير موجودة");

  // Anything sitting in a TRIAL grade goes too, whether or not it was
  // named TRIAL — that covers the classrooms and lessons added by hand
  // while trying the boundary out.
  const gradeIds = (
    await Grade.find({ school: school._id, name: /^TRIAL/ }).select("_id")
  ).map((grade) => grade._id);

  const classroomIds = (
    await Classroom.find({
      school: school._id,
      $or: [{ name: /^TRIAL/ }, { grade: { $in: gradeIds } }],
    }).select("_id")
  ).map((classroom) => classroom._id);

  const counts = {
    الجداول: (await Schedule.deleteMany({
      school: school._id,
      classroom: { $in: classroomIds },
    })).deletedCount,
    الإشعارات: (await Notification.deleteMany({ school: school._id })).deletedCount,
    الطلاب: (await Student.deleteMany({
      school: school._id,
      $or: [{ firstName: "TRIAL" }, { grade: { $in: gradeIds } }],
    })).deletedCount,
    الحسابات: (await User.deleteMany({
      school: school._id,
      firstName: "TRIAL",
    })).deletedCount,
    الفصول: (await Classroom.deleteMany({ _id: { $in: classroomIds } })).deletedCount,
    الصفوف: (await Grade.deleteMany({ _id: { $in: gradeIds } })).deletedCount,
  };

  console.log("اتمسح:", JSON.stringify(counts, null, 2));
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("فشل:", err.message);
  process.exit(1);
});
