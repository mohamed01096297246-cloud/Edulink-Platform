// Moves subjects and teachers onto the many-to-many shape:
//
//   Subject.grade  (one)  -> Subject.grades  (many)
//   User.subject   (one)  -> User.subjects   (many)
//
// and drops the { name, grade, school } index that only made sense while a
// subject belonged to exactly one grade. Mongoose never removes an index it
// has stopped declaring, so leaving that one in place would keep rejecting
// the very rows this change exists to allow.
//
// Safe to run repeatedly: every step checks the current state first, and a
// document already migrated is skipped rather than rewritten.
require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const subjects = db.collection("subjects");
  const users = db.collection("users");

  // ---- 1. Subject.grade -> Subject.grades ----
  const needGrades = await subjects
    .find({ grade: { $exists: true }, grades: { $exists: false } })
    .toArray();

  for (const subject of needGrades) {
    await subjects.updateOne(
      { _id: subject._id },
      {
        $set: { grades: subject.grade ? [subject.grade] : [], allGrades: false },
        $unset: { grade: "" },
      },
    );
  }
  console.log(`subjects moved to grades[]: ${needGrades.length}`);

  // Any row that already had `grades` but still carries the old field.
  const leftover = await subjects.updateMany(
    { grade: { $exists: true }, grades: { $exists: true } },
    { $unset: { grade: "" } },
  );
  console.log(`stale grade field removed: ${leftover.modifiedCount}`);

  // Rows that predate `allGrades` entirely.
  const flagged = await subjects.updateMany(
    { allGrades: { $exists: false } },
    { $set: { allGrades: false } },
  );
  console.log(`allGrades defaulted: ${flagged.modifiedCount}`);

  // ---- 2. User.subject -> User.subjects ----
  const needSubjects = await users
    .find({ role: "teacher", subjects: { $exists: false } })
    .toArray();

  for (const teacher of needSubjects) {
    await users.updateOne(
      { _id: teacher._id },
      {
        $set: { subjects: teacher.subject ? [teacher.subject] : [] },
        $unset: { subject: "" },
      },
    );
  }
  console.log(`teachers moved to subjects[]: ${needSubjects.length}`);

  const leftoverTeachers = await users.updateMany(
    { subject: { $exists: true }, subjects: { $exists: true } },
    { $unset: { subject: "" } },
  );
  console.log(`stale subject field removed: ${leftoverTeachers.modifiedCount}`);

  // ---- 3. Indexes ----
  const existing = await subjects.indexes();

  for (const index of existing) {
    if (index.key && index.key.grade !== undefined) {
      await subjects.dropIndex(index.name);
      console.log(`dropped stale index: ${index.name}`);
    }
  }

  const hasNameSchool = (await subjects.indexes()).some(
    (i) => i.key && i.key.name === 1 && i.key.school === 1 && !i.key.grade,
  );

  if (!hasNameSchool) {
    // A pre-existing duplicate name would make this throw rather than
    // silently skip — that is the intent: it needs a human decision about
    // which row survives, not a guess from a migration.
    await subjects.createIndex({ name: 1, school: 1 }, { unique: true });
    console.log("created index: name_1_school_1 (unique)");
  } else {
    console.log("index name_1_school_1 already present");
  }

  console.log("\nfinal subject indexes:");
  (await subjects.indexes()).forEach((i) => console.log(`  ${i.name}`));

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("migration failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
