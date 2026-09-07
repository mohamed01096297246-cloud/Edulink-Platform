// Replaces the attendance uniqueness index with the pair the cover-lesson
// feature needs.
//
// Before: { student, schedule, date } unique, over every row.
// After:  { student, schedule, date } unique but only where `schedule` is set,
//         plus { student, coverSession } unique only where `coverSession` is.
//
// Cover-lesson rows carry no `schedule`. Under the old index they would all
// collapse to { student, null, date }, which lets a student have exactly one
// cover lesson per day and fails the second with a duplicate-key error the
// teacher can do nothing about.
//
// Safe to re-run: it checks what is already there and only makes up the
// difference. Nothing is deleted except the index definition itself; no
// attendance record is touched.
//
//   node scripts/migrate-attendance-cover-index.js

require("dotenv").config();
const mongoose = require("mongoose");

const OLD = "student_1_schedule_1_date_1";
const NEW_LESSON = "student_schedule_date_unique";
const NEW_COVER = "student_coverSession_unique";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const attendances = mongoose.connection.db.collection("attendances");

  const names = () => attendances.indexes().then((all) => all.map((i) => i.name));
  console.log("indexes before:", (await names()).join(", "));

  // Guard: a duplicate that the old index allowed but a new one would not
  // must be found now, not halfway through the build.
  const clashes = await attendances
    .aggregate([
      { $match: { coverSession: { $type: "objectId" } } },
      { $group: { _id: { s: "$student", c: "$coverSession" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $count: "n" },
    ])
    .toArray();

  if (clashes.length > 0) {
    console.error(
      `Refusing to build ${NEW_COVER}: ${clashes[0].n} student/cover-session ` +
        "pair(s) already appear more than once. Resolve those rows first.",
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  // Build the replacements before dropping the old one, so the collection is
  // never left without a uniqueness guarantee on timetabled lessons.
  if (!(await names()).includes(NEW_LESSON)) {
    await attendances.createIndex(
      { student: 1, schedule: 1, date: 1 },
      {
        unique: true,
        partialFilterExpression: { schedule: { $type: "objectId" } },
        name: NEW_LESSON,
      },
    );
    console.log(`created ${NEW_LESSON}`);
  }

  if (!(await names()).includes(NEW_COVER)) {
    await attendances.createIndex(
      { student: 1, coverSession: 1 },
      {
        unique: true,
        partialFilterExpression: { coverSession: { $type: "objectId" } },
        name: NEW_COVER,
      },
    );
    console.log(`created ${NEW_COVER}`);
  }

  if ((await names()).includes(OLD)) {
    await attendances.dropIndex(OLD);
    console.log(`dropped ${OLD}`);
  } else {
    console.log(`${OLD} already gone`);
  }

  console.log("indexes after: ", (await names()).join(", "));
  await mongoose.disconnect();
})().catch((err) => {
  console.error("failed:", err.message);
  process.exit(1);
});
