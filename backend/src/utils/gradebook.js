const Classroom = require("../models/Classroom");
const Grade = require("../models/Grade");
const School = require("../models/School");

// How a school marks a stage's coursework ("أعمال السنة"). Each scheme
// mirrors a paper register form a real school prints, because the numbers
// the teacher sees on screen have to be the numbers on that paper.
//
// classic — every school's scheme before this file existed. A week is 25:
//   مواظبة 5 (worked out from the attendance rate), واجب 5 (from homework
//   marks), تقييم أسبوعي 10, كراسة الحصة 5. The term adds a monthly test
//   out of 15.
//
// weekly40 — the preparatory register of مدارس المستقبل. A week is 40:
//   الواجب المنزلي 10 (from homework marks, adjustable), تقييم أسبوعي 20,
//   مواظبة وسلوك 10 — entered by the teacher, with no attendance formula
//   behind it. No classwork notebook, no behaviour notes. A month averages
//   its weeks; a term (four months) averages its months, adds two tests of
//   15 each, and comes to أعمال السنة out of 70.
//
// Stored per school and per stage (School.gradebook), so a school can run
// one stage on its own paper and leave the rest untouched.
const SCHEMES = {
  classic: {
    max: { attendanceScore: 5, homeworkScore: 5, weeklyEvalScore: 10, classworkScore: 5 },
    weekTotal: 25,
    // مواظبة is calculated from attendance; a teacher only overrides it.
    attendanceComputed: true,
    classwork: true,
  },
  weekly40: {
    max: { attendanceScore: 10, homeworkScore: 10, weeklyEvalScore: 20 },
    weekTotal: 40,
    attendanceComputed: false,
    classwork: false,
    termMonths: { 1: [9, 10, 11, 12], 2: [2, 3, 4, 5] },
    termTests: 2,
    termTestMax: 15,
    termTotal: 70,
  },
};

const DEFAULT_SCHEME = "classic";

const schemeFor = (school, stage) =>
  (stage && school?.gradebook?.[stage]) || DEFAULT_SCHEME;

// The scheme that governs a classroom's marks — read off its grade's stage
// and its school's settings. Everything that scores or validates a mark
// goes through this, so a classroom can never be scored one way and
// validated another.
const schemeForClassroom = async (classroomOrId) => {
  const classroom =
    classroomOrId && classroomOrId.grade !== undefined
      ? classroomOrId
      : await Classroom.findById(classroomOrId).select("grade school");
  if (!classroom) return DEFAULT_SCHEME;

  const [grade, school] = await Promise.all([
    Grade.findById(classroom.grade).select("stage"),
    School.findById(classroom.school).select("gradebook"),
  ]);
  return schemeFor(school, grade?.stage);
};

// For a teacher's app: which screens to show. A teacher whose grades all
// sit in a weekly40 stage gets that set of screens; anyone else keeps the
// classic ones. (A teacher across two stages with different schemes still
// has every mark scored correctly — that is decided per classroom above —
// and keeps the classic screens, which are the superset.)
const schemeForTeacher = async (user) => {
  if (!user || user.role !== "teacher" || !user.school) return DEFAULT_SCHEME;

  const [school, grades] = await Promise.all([
    School.findById(user.school).select("gradebook"),
    Grade.find({ _id: { $in: user.teachingGrades || [] } }).select("stage"),
  ]);
  if (!grades.length) return DEFAULT_SCHEME;

  const schemes = new Set(grades.map((g) => schemeFor(school, g.stage)));
  return schemes.size === 1 ? [...schemes][0] : DEFAULT_SCHEME;
};

module.exports = {
  SCHEMES,
  DEFAULT_SCHEME,
  schemeFor,
  schemeForClassroom,
  schemeForTeacher,
};
