// One-time move to the period-based timetable (see utils/periods.js).
//
// 1. Grades 1-3 break after the 3rd period (10:30) for 15 minutes. Grades
//    4-6 are left with no break until the school settles theirs — it can be
//    set later from the grades screen, which re-times their periods itself.
// 2. The existing الصف الاول timetable was built on a 45-minute grid that no
//    longer exists, and the school chose to rebuild it rather than convert
//    it, so those slots are removed — along with the substitutions that
//    pointed at them (both for a date already past), which would otherwise
//    dangle.
//
// Idempotent. Pass --dry-run to see what would change.
require("dotenv").config();
const mongoose = require("mongoose");

const Grade = require("../src/models/Grade");
const Classroom = require("../src/models/Classroom");
const Schedule = require("../src/models/Schedule");
const Substitution = require("../src/models/Substitution");

const DRY_RUN = process.argv.includes("--dry-run");

const BREAK_GRADES = ["الصف الاول الابتدائي", "الصف الثاني الابتدائي", "الصف الثالث الابتدائي"];
const REBUILD_GRADE = "الصف الاول الابتدائي";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(DRY_RUN ? "=== DRY RUN ===\n" : "");

  for (const name of BREAK_GRADES) {
    const grade = await Grade.findOne({ name });
    if (!grade) {
      console.log(`grade not found: ${name}`);
      continue;
    }
    const already = grade.breakAfterPeriod === 3 && grade.breakMinutes === 15;
    console.log(`${name}: break ${already ? "already set" : "-> after period 3, 15 min"}`);
    if (!already && !DRY_RUN) {
      await Grade.updateOne({ _id: grade._id }, { $set: { breakAfterPeriod: 3, breakMinutes: 15 } });
    }
  }

  const rebuild = await Grade.findOne({ name: REBUILD_GRADE });
  const classroomIds = (await Classroom.find({ grade: rebuild._id }).select("_id")).map((c) => c._id);
  const schedules = await Schedule.find({ classroom: { $in: classroomIds } }).select("_id");
  const scheduleIds = schedules.map((s) => s._id);
  const subs = await Substitution.countDocuments({ schedule: { $in: scheduleIds } });

  console.log(`\n${REBUILD_GRADE}: ${scheduleIds.length} old timetable slots to remove`);
  console.log(`substitutions pointing at them: ${subs}`);

  if (!DRY_RUN && scheduleIds.length > 0) {
    const s = await Substitution.deleteMany({ schedule: { $in: scheduleIds } });
    const d = await Schedule.deleteMany({ _id: { $in: scheduleIds } });
    console.log(`deleted: ${d.deletedCount} slots, ${s.deletedCount} substitutions`);
  }

  // Any substitution left pointing at a schedule that no longer exists.
  const allSubs = await Substitution.find().select("schedule");
  const liveIds = new Set((await Schedule.find().select("_id")).map((s) => String(s._id)));
  const orphans = allSubs.filter((x) => !liveIds.has(String(x.schedule)));
  console.log(`\norphaned substitutions (schedule missing): ${orphans.length}`);
  if (!DRY_RUN && orphans.length > 0) {
    const o = await Substitution.deleteMany({ _id: { $in: orphans.map((x) => x._id) } });
    console.log(`deleted orphans: ${o.deletedCount}`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("migration failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
