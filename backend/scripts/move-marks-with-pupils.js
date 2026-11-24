// Pupils moved to another class of their grade before marks moved with them
// (utils/classMoves.js, 2026-11-24): their marks still sit in the old class.
// This moves them the same way a move does now — into the weeks and tests
// the new class has recorded; the rest wait and join when it records them.
//
//   node scripts/move-marks-with-pupils.js            dry run: what would move
//   node scripts/move-marks-with-pupils.js --apply    move, and write a log of
//                                                     every mark moved (to undo)
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Student = require("../src/models/Student");
const Classroom = require("../src/models/Classroom");
const School = require("../src/models/School");
const { moveMarks, KINDS } = require("../src/utils/classMoves");

const APPLY = process.argv.includes("--apply");
const LOG_DIR = "D:\\EduLink-backups";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const classes = new Map((await Classroom.find().select("name grade school").lean()).map((c) => [String(c._id), c]));
  const schools = new Map((await School.find().select("name").lean()).map((s) => [String(s._id), s.name]));

  // Every (pupil, class) pair of a mark filed under a class the pupil isn't in.
  const pairs = new Map();
  for (const { models } of Object.values(KINDS)) {
    for (const Model of models) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await Model.aggregate([{ $group: { _id: { student: "$student", classroom: "$classroom" } } }]);
      rows.forEach((r) => pairs.set(`${r._id.student}|${r._id.classroom}`, r._id));
    }
  }
  const pupils = new Map(
    (await Student.find({ _id: { $in: [...pairs.values()].map((p) => p.student) } }).select("firstName lastName classroom grade").lean()).map(
      (s) => [String(s._id), s],
    ),
  );

  const todo = [];
  for (const { student, classroom } of pairs.values()) {
    const pupil = pupils.get(String(student));
    if (!pupil || !pupil.classroom || String(pupil.classroom) === String(classroom)) continue;
    const from = classes.get(String(classroom));
    const to = classes.get(String(pupil.classroom));
    // Same grade only — as a move does.
    if (!from || !to || String(from.grade) !== String(to.grade)) continue;
    todo.push({ pupil, from, to });
  }

  const log = [];
  for (const { pupil, from, to } of todo) {
    // What sits in the old class now, to log exactly what moved.
    const docsBefore = [];
    for (const { models } of Object.values(KINDS)) {
      for (const Model of models) {
        // eslint-disable-next-line no-await-in-loop
        const ids = await Model.find({ student: pupil._id, classroom: from._id }).distinct("_id");
        ids.forEach((id) => docsBefore.push({ model: Model.modelName, _id: String(id) }));
      }
    }
    let result;
    if (APPLY) {
      // eslint-disable-next-line no-await-in-loop
      result = await moveMarks(pupil._id, from._id, to._id);
      for (const d of docsBefore) {
        // eslint-disable-next-line no-await-in-loop
        const now = await mongoose.model(d.model).findById(d._id).select("classroom").lean();
        if (now && String(now.classroom) === String(to._id)) log.push({ ...d, from: String(from._id), to: String(to._id) });
      }
    } else {
      // A dry run on a session that is never committed would still need a
      // replica set; count instead, with the same rule moveMarks uses.
      // eslint-disable-next-line no-await-in-loop
      result = await dryRun(pupil._id, from._id, to._id);
    }
    console.log(
      `${schools.get(String(from.school))} | ${pupil.firstName} ${pupil.lastName} | ${from.name} → ${to.name} | ` +
        `${APPLY ? "moved" : "would move"} ${result.moved}, waiting ${result.waiting}`,
    );
  }

  if (APPLY && log.length) {
    const file = path.join(LOG_DIR, `moved-marks-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify(log, null, 2));
    console.log(`log of ${log.length} moved marks: ${file}`);
  }
  if (todo.length === 0) console.log("nothing to move");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// moveMarks' rule, read only.
async function dryRun(studentId, fromId, toId) {
  let moved = 0;
  let waiting = 0;
  for (const { models, fields } of Object.values(KINDS)) {
    for (const Model of models) {
      // eslint-disable-next-line no-await-in-loop
      const docs = await Model.find({ student: studentId, classroom: fromId }).select(fields.join(" ")).lean();
      for (const d of docs) {
        const where = { classroom: toId, ...Object.fromEntries(fields.map((k) => [k, d[k]])) };
        // eslint-disable-next-line no-await-in-loop
        const own = await Promise.all(models.map((M) => M.exists(where)));
        if (own.some(Boolean)) moved += 1;
        else waiting += 1;
      }
    }
  }
  return { moved, waiting };
}
