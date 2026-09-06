const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");

// The four "أعمال السنة" columns for a single [weekStart, weekStart+6 days]
// window. Lives here rather than inside a controller because two different
// places have to agree on it exactly: the Excel register the teacher prints,
// and the weekly-evaluation screen the teacher edits. If they each computed
// it themselves, an edit on screen and a number in print could drift apart.
const MAX_SCORES = {
  attendanceScore: 5,
  homeworkScore: 5,
  weeklyEvalScore: 10,
  classworkScore: 5,
};

const round1 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10;

const normalizeDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

const weekEnd = (weekStart) => {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const computeWeekScores = async (classroomId, subjectId, studentIds, weekStart) => {
  const rangeEnd = weekEnd(weekStart);

  const [
    attendanceRecords,
    homeworks,
    weeklyEvaluations,
    classworkEntries,
    overrides,
  ] = await Promise.all([
    Attendance.find({
      student: { $in: studentIds },
      subject: subjectId,
      date: { $gte: weekStart, $lte: rangeEnd },
    }).select("student status excused"),
    // A homework belongs to the week it was *set* in, not the week it
    // happens to fall due. Matching on dueDate silently dropped any
    // homework a teacher assigned on, say, Thursday for the following
    // week — it landed in a week the register wasn't printing, so the
    // column came out empty even though the marks were entered.
    Homework.find({
      classroom: classroomId,
      subject: subjectId,
      createdAt: { $gte: weekStart, $lte: rangeEnd },
    }).select("_id totalMarks"),
    WeeklyEvaluation.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart,
    }).select("student score"),
    ClassworkNotebook.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart,
    }).select("student score"),
    CourseworkOverride.find({
      student: { $in: studentIds },
      subject: subjectId,
      weekStart,
    }).select("student attendanceScore homeworkScore"),
  ]);

  const attendanceByStudent = new Map();
  attendanceRecords.forEach((record) => {
    // An excused absence is left out of the calculation entirely, matching
    // the attendance rate shown to parents — it neither earns nor costs
    // the student marks here.
    if (record.status === "absent" && record.excused) return;

    const key = record.student.toString();
    if (!attendanceByStudent.has(key)) {
      attendanceByStudent.set(key, { total: 0, attended: 0 });
    }
    const bucket = attendanceByStudent.get(key);
    bucket.total += 1;
    if (record.status === "present" || record.status === "late") {
      bucket.attended += 1;
    }
  });

  const homeworkIds = homeworks.map((h) => h._id);
  const weekHomeworkMax = homeworks.reduce((sum, h) => sum + h.totalMarks, 0);

  const homeworkResults = homeworkIds.length
    ? await HomeworkResult.find({
        homework: { $in: homeworkIds },
        student: { $in: studentIds },
      }).select("student score status")
    : [];

  const homeworkByStudent = new Map();
  homeworkResults.forEach((record) => {
    const key = record.student.toString();
    const earned = record.status === "missing" ? 0 : record.score || 0;
    homeworkByStudent.set(key, (homeworkByStudent.get(key) || 0) + earned);
  });

  const weeklyByStudent = new Map();
  weeklyEvaluations.forEach((record) => {
    weeklyByStudent.set(record.student.toString(), record.score);
  });

  const classworkByStudent = new Map();
  classworkEntries.forEach((record) => {
    classworkByStudent.set(record.student.toString(), record.score);
  });

  const overrideByStudent = new Map();
  overrides.forEach((record) => {
    overrideByStudent.set(record.student.toString(), record);
  });

  const scores = {};
  studentIds.forEach((id) => {
    const key = id.toString();

    const attendance = attendanceByStudent.get(key);
    const attendanceRate =
      attendance && attendance.total > 0 ? attendance.attended / attendance.total : null;
    const computedAttendance =
      attendanceRate === null ? null : round1(attendanceRate * 3 + 2);

    const homeworkEarned = homeworkByStudent.get(key) || 0;
    const computedHomework =
      weekHomeworkMax > 0 ? round1((homeworkEarned / weekHomeworkMax) * 5) : null;

    // A teacher's manual correction replaces the computed number outright —
    // that's the whole point of it. `null` on the document (or no document)
    // means the column was never overridden.
    const override = overrideByStudent.get(key);
    const hasAttendanceOverride =
      override && override.attendanceScore !== undefined && override.attendanceScore !== null;
    const hasHomeworkOverride =
      override && override.homeworkScore !== undefined && override.homeworkScore !== null;

    const attendanceScore = hasAttendanceOverride
      ? override.attendanceScore
      : computedAttendance;
    const homeworkScore = hasHomeworkOverride ? override.homeworkScore : computedHomework;

    const weeklyEvalScore = weeklyByStudent.has(key) ? weeklyByStudent.get(key) : null;

    const classworkScore = classworkByStudent.has(key)
      ? classworkByStudent.get(key)
      : null;

    const total = [attendanceScore, homeworkScore, weeklyEvalScore, classworkScore]
      .filter((v) => v !== null && !Number.isNaN(v))
      .reduce((a, b) => a + b, 0);

    scores[key] = {
      attendanceScore,
      homeworkScore,
      weeklyEvalScore,
      classworkScore,
      total: round1(total),
      // Lets the app show the teacher which numbers it computed and which
      // ones they changed by hand (and offer to put them back).
      overridden: {
        attendanceScore: Boolean(hasAttendanceOverride),
        homeworkScore: Boolean(hasHomeworkOverride),
      },
      computed: {
        attendanceScore: computedAttendance,
        homeworkScore: computedHomework,
      },
    };
  });

  return scores;
};

module.exports = { computeWeekScores, normalizeDate, weekEnd, MAX_SCORES };
