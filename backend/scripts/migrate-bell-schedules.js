// Loads مدرسة الرحمة's real bell times (as given by the school, 2026-09-16)
// and re-times every period already in the timetable to match.
//
// Replaces the short-lived formula version (50-minute periods + a per-grade
// break), which couldn't express the school's actual hours: they differ by
// grade AND day, the upper grades run 40-minute periods after the 3rd, and
// there are five-minute changeovers after the breaks. The per-grade break
// fields that version added are removed from the grades.
//
// Nothing is written if any stored period would be left without a time or a
// teacher would end up double-booked. Idempotent. --dry-run to preview.
require("dotenv").config();
const mongoose = require("mongoose");

const School = require("../src/models/School");
const Grade = require("../src/models/Grade");
const Classroom = require("../src/models/Classroom");
const Schedule = require("../src/models/Schedule");
const BellSchedule = require("../src/models/BellSchedule");
const { validateBellShape, planRetime, DAY_NAMES, periodLabel } = require("../src/utils/periods");

const DRY_RUN = process.argv.includes("--dry-run");
const SCHOOL_NAME = "مدرسة الرحمة الابتدائية الخاصة";

const LOWER = ["الصف الاول الابتدائي", "الصف الثاني الابتدائي", "الصف الثالث الابتدائي"];
const UPPER = ["الصف الرابع الابتدائي", "الصف الخامس الابتدائي", "الصف السادس الابتدائي"];

const p = (period, startTime, endTime) => ({ period, startTime, endTime });

const PROFILES = [
  {
    name: "أولى إلى تالتة — الأحد والاثنين والثلاثاء",
    grades: LOWER,
    days: ["sun", "mon", "tue"],
    periods: [
      p(1, "08:00", "08:50"), p(2, "08:50", "09:40"), p(3, "09:40", "10:30"),
      p(4, "10:55", "11:45"), p(5, "11:45", "12:35"), p(6, "12:35", "13:25"),
      p(7, "13:25", "14:15"),
    ],
    breaks: [{ startTime: "10:30", endTime: "10:50" }],
  },
  {
    name: "أولى إلى تالتة — الأربعاء والخميس",
    grades: LOWER,
    days: ["wed", "thu"],
    periods: [
      p(1, "08:00", "08:50"), p(2, "08:50", "09:40"), p(3, "09:40", "10:30"),
      p(4, "11:05", "11:55"), p(5, "11:55", "12:45"), p(6, "12:50", "13:40"),
    ],
    breaks: [{ startTime: "10:30", endTime: "11:00" }],
  },
  {
    name: "رابعة إلى سادسة — الأحد إلى الأربعاء",
    grades: UPPER,
    days: ["sun", "mon", "tue", "wed"],
    periods: [
      p(1, "08:00", "08:50"), p(2, "08:50", "09:40"), p(3, "09:40", "10:30"),
      p(4, "10:30", "11:10"), p(5, "11:35", "12:15"), p(6, "12:15", "12:55"),
      p(7, "12:55", "13:35"), p(8, "13:35", "14:15"),
    ],
    breaks: [{ startTime: "11:15", endTime: "11:35" }],
  },
  {
    name: "رابعة إلى سادسة — الخميس",
    grades: UPPER,
    days: ["thu"],
    periods: [
      p(1, "08:00", "08:50"), p(2, "08:50", "09:40"), p(3, "09:40", "10:30"),
      p(4, "10:30", "11:20"), p(5, "11:40", "12:20"), p(6, "12:20", "13:00"),
      p(7, "13:00", "13:40"),
    ],
    breaks: [{ startTime: "11:20", endTime: "11:40" }],
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (DRY_RUN) console.log("=== DRY RUN ===\n");

  const school = await School.findOne({ name: SCHOOL_NAME });
  const grades = await Grade.find({ school: school._id }).select("name");
  const gradeId = new Map(grades.map((g) => [g.name, g._id]));

  const bells = PROFILES.map((profile) => {
    const ids = profile.grades.map((n) => {
      if (!gradeId.has(n)) throw new Error(`grade not found: ${n}`);
      return gradeId.get(n);
    });
    const bell = { ...profile, grades: ids, school: school._id };
    const err = validateBellShape(bell);
    if (err) throw new Error(`${profile.name}: ${err}`);
    return bell;
  });

  const classrooms = await Classroom.find({ school: school._id }).select("name grade");
  const classroomGrade = new Map(classrooms.map((c) => [String(c._id), String(c.grade)]));
  const classroomName = new Map(classrooms.map((c) => [String(c._id), c.name]));
  const schedules = await Schedule.find({ school: school._id }).select("teacher classroom day period startTime endTime").lean();

  const plan = planRetime({ schedules, classroomGrade, bells });
  console.log(`schedules in school: ${schedules.length}`);
  console.log(`to re-time: ${plan.ops.length}`);
  console.log(`left without a time: ${plan.orphans.length}`);
  for (const s of plan.orphans) console.log(`  ${classroomName.get(String(s.classroom))} ${DAY_NAMES[s.day]} ${periodLabel(s.period)}`);
  console.log(`teacher double-bookings: ${plan.teacherClashes.length}`);

  if (plan.orphans.length || plan.teacherClashes.length) {
    console.log("\nnot applying — resolve the above first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const s of plan.ops.slice(0, 50)) {
    const before = schedules.find((x) => String(x._id) === String(s.updateOne.filter._id));
    const after = s.updateOne.update.$set;
    console.log(`  ${classroomName.get(String(before.classroom))} ${DAY_NAMES[before.day]} ${periodLabel(before.period)}: ${before.startTime}-${before.endTime} -> ${after.startTime}-${after.endTime}`);
  }

  if (!DRY_RUN) {
    for (const bell of bells) {
      await BellSchedule.findOneAndUpdate(
        { school: school._id, name: bell.name },
        { $set: { grades: bell.grades, days: bell.days, periods: bell.periods, breaks: bell.breaks } },
        { upsert: true, new: true, runValidators: true },
      );
    }
    if (plan.ops.length) await Schedule.bulkWrite(plan.ops);
    const unset = await Grade.updateMany(
      { $or: [{ breakAfterPeriod: { $exists: true } }, { breakMinutes: { $exists: true } }] },
      { $unset: { breakAfterPeriod: "", breakMinutes: "" } },
    );
    console.log(`\nbell schedules saved: ${await BellSchedule.countDocuments({ school: school._id })}`);
    console.log(`schedules re-timed: ${plan.ops.length}`);
    console.log(`grades cleared of old break fields: ${unset.modifiedCount}`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("migration failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
