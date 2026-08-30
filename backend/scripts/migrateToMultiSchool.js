// One-time migration: run this ONCE, after deploying the multi-school
// code, against your existing production database.
//
// What it does:
//   1. Creates one School document representing your current school (all
//      of your existing data becomes that school's data).
//   2. Tags every existing Grade/Classroom/Subject/Student/User/Schedule/
//      Exam/Notification/Homework/Attendance/Behavior/HomeworkResult/
//      Result with that school's id.
//   3. Leaves your existing "admin_master" account exactly as it is today
//      — a normal admin of that one school. Nothing about how you log in
//      or use the admin panel changes.
//   4. Creates ONE new, separate platform super-admin account, used only
//      for onboarding future schools (via POST /api/schools). Its
//      credentials are printed once at the end — save them somewhere safe,
//      they are not shown again and not emailed.
//
// Usage:
//   node scripts/migrateToMultiSchool.js "My School Name" "SCHOOLCODE"
//
// Safe to run only once — it refuses to run again if any School already
// exists.

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");

const {
  generateUsername,
  generatePassword,
} = require("../src/utils/generateCredentials");

const School = require("../src/models/School");
const User = require("../src/models/User");
const Grade = require("../src/models/Grade");
const Classroom = require("../src/models/Classroom");
const Subject = require("../src/models/Subject");
const Student = require("../src/models/Student");
const Schedule = require("../src/models/Schedule");
const Exam = require("../src/models/Exam");
const Notification = require("../src/models/Notification");
const Homework = require("../src/models/Homework");
const Attendance = require("../src/models/Attendance");
const Behavior = require("../src/models/Behavior");
const HomeworkResult = require("../src/models/HomeworkResult");
const Result = require("../src/models/Result");

const run = async () => {
  const [, , nameArg, codeArg] = process.argv;
  const schoolName = nameArg || "My School";
  const schoolCode = (codeArg || "DEFAULT").trim().toUpperCase();

  await connectDB();

  const alreadyMigrated = await School.countDocuments();
  if (alreadyMigrated > 0) {
    console.log(
      "A School document already exists — this migration has already run. Aborting to avoid duplicating data.",
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  const school = await School.create({
    name: schoolName,
    code: schoolCode,
    plan: "owned",
  });
  console.log(`Created school: ${school.name} (${school.code})`);

  const scopedModels = [
    Grade,
    Classroom,
    Subject,
    Student,
    User,
    Schedule,
    Exam,
    Notification,
    Homework,
    Attendance,
    Behavior,
    HomeworkResult,
    Result,
  ];

  for (const Model of scopedModels) {
    const result = await Model.updateMany(
      { school: { $exists: false } },
      { $set: { school: school._id } },
    );
    console.log(
      `  ${Model.modelName}: tagged ${result.modifiedCount} document(s)`,
    );
  }

  // Reconcile indexes now that Grade/Classroom/Subject's uniqueness rules
  // changed shape (Subject.code in particular went from globally unique to
  // unique-per-school).
  await Grade.syncIndexes();
  await Classroom.syncIndexes();
  await Subject.syncIndexes();
  console.log("Synced updated unique indexes for Grade/Classroom/Subject.");

  const masterAdmin = await User.findOneAndUpdate(
    { username: "admin_master" },
    { $set: { isPrimaryAdmin: true } },
    { new: true },
  );
  if (masterAdmin) {
    console.log(
      "Marked admin_master as this school's primary admin (can still create/manage its sub-admins, exactly as before).",
    );
  } else {
    console.log(
      "No admin_master account found — skipped the primary-admin flag.",
    );
  }

  const platformUsername = generateUsername("00000000000");
  const platformPassword = generatePassword();

  await User.create({
    firstName: "EduLink",
    lastName: "Platform",
    nationalId: `PLATFORM-${Date.now()}`,
    phoneNumber: "00000000000",
    role: "admin",
    isSuperAdmin: true,
    school: null,
    username: platformUsername,
    password: platformPassword,
    active: true,
  });

  console.log("\n=== Migration complete ===");
  console.log(
    "Your existing admin_master account is unchanged and still manages the school above.",
  );
  console.log("A new platform super-admin account was created:");
  console.log(`  username: ${platformUsername}`);
  console.log(`  password: ${platformPassword}`);
  console.log(
    "Save these now — this is the only time the password is shown. Use this account only to onboard new schools via POST /api/schools.",
  );

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
