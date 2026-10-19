const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const Subject = require("../models/Subject");

// The classes a teacher teaches, and which subject in each: what the
// timetable says, plus what the school assigned them before the timetable
// existed (models/ClassAssignment.js). A school that never assigns reads
// exactly as before — the timetable alone.
//
// Returns [{ classroom, subject }] with raw ids, one row per pair.
const teacherClassPairs = async (teacherId) => {
  const [timetabled, assigned] = await Promise.all([
    Schedule.find({ teacher: teacherId }).select("classroom subject").lean(),
    ClassAssignment.find({ teacher: teacherId }).select("classroom subject").lean(),
  ]);

  const seen = new Set();
  const pairs = [];
  for (const row of [...assigned, ...timetabled]) {
    if (!row.classroom) continue;
    const key = `${row.classroom}:${row.subject || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ classroom: row.classroom, subject: row.subject || null });
  }
  return pairs;
};

const teacherClassroomIds = async (teacherId) => [
  ...new Set((await teacherClassPairs(teacherId)).map((p) => String(p.classroom))),
];

// The subjects this teacher takes in one class, by either route.
const teacherSubjectsIn = async (teacherId, classroomId) =>
  [
    ...new Set(
      (await teacherClassPairs(teacherId))
        .filter((p) => String(p.classroom) === String(classroomId) && p.subject)
        .map((p) => String(p.subject)),
    ),
  ];

// The classes where the teacher has marks to record: all of them, less those
// where everything they take is taught but not marked (Subject.noMarks).
const teacherMarkClassroomIds = async (teacherId) => {
  const pairs = await teacherClassPairs(teacherId);
  const unmarked = new Set(
    (
      await Subject.find({ _id: { $in: pairs.map((p) => p.subject).filter(Boolean) }, noMarks: true }).distinct("_id")
    ).map(String),
  );
  return [
    ...new Set(pairs.filter((p) => !p.subject || !unmarked.has(String(p.subject))).map((p) => String(p.classroom))),
  ];
};

module.exports = { teacherClassPairs, teacherClassroomIds, teacherSubjectsIn, teacherMarkClassroomIds };
