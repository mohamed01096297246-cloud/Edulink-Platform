const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");

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

module.exports = { teacherClassPairs, teacherClassroomIds, teacherSubjectsIn };
