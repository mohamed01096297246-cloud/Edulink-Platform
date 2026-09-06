// Drops a leftover unique index on attendances: { student: 1, date: 1 }.
//
// Attendance is recorded per lesson — the model declares
// { student, schedule, date } unique, which is the right rule: one register
// entry per student, per lesson, per day. An older revision of the schema
// keyed on { student, date } instead, and Mongoose never removes an index it
// no longer declares, so the old one stayed behind in the database enforcing
// "one attendance record per student per DAY, across every subject".
//
// The effect was silent and severe: whoever taught a student first each day
// won the insert, and every later lesson's bulk save failed with a duplicate
// key error. It also contradicts the per-subject attendance that the grade
// register and coursework totals are built on.
//
// Safe to run more than once; drops nothing if the index is already gone.
//
//   node scripts/drop-stale-attendance-index.js

require("dotenv").config();
const mongoose = require("mongoose");

const STALE = "student_1_date_1";
const CORRECT = "student_1_schedule_1_date_1";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const attendances = mongoose.connection.db.collection("attendances");

  const before = await attendances.indexes();
  const names = before.map((i) => i.name);
  console.log("indexes before:", names.join(", "));

  if (!names.includes(CORRECT)) {
    console.error(
      `Refusing to drop ${STALE}: the correct index ${CORRECT} is missing, ` +
        "so dropping would leave duplicate lesson registers unguarded. " +
        "Start the app once to let Mongoose build it, then re-run this.",
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!names.includes(STALE)) {
    console.log(`${STALE} is already gone — nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  await attendances.dropIndex(STALE);
  console.log(`dropped ${STALE}`);

  const after = await attendances.indexes();
  console.log("indexes after: ", after.map((i) => i.name).join(", "));

  await mongoose.disconnect();
})().catch((err) => {
  console.error("failed:", err.message);
  process.exit(1);
});
