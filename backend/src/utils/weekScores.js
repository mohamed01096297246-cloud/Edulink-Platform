const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");
const { SCHEMES, DEFAULT_SCHEME, conductEnteredFrom, isConductEntered } = require("./gradebook");
const Classroom = require("../models/Classroom");
const { isDailyMode } = require("./dailyAttendance");
const { worthOf, earnedOn } = require("./homeworkMarks");
const { hasWeeklyEval } = require("./schoolMonths");
const { averageToHalf } = require("./halfMarks");
const { isAbsent } = require("./absentMark");

// The four "أعمال السنة" columns for a single [weekStart, weekStart+6 days]
// window. Lives here rather than inside a controller because two different
// places have to agree on it exactly: the Excel register the teacher prints,
// and the weekly-evaluation screen the teacher edits. If they each computed
// it themselves, an edit on screen and a number in print could drift apart.
//
// Which columns there are, and what each is out of, depends on the school's
// marking scheme for the classroom's stage (see utils/gradebook.js).
// MAX_SCORES is the classic set, kept for callers that predate schemes.
const MAX_SCORES = SCHEMES.classic.max;
const maxScoresFor = (scheme) => (SCHEMES[scheme] || SCHEMES[DEFAULT_SCHEME]).max;

const round1 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10;

const normalizeDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

// The Sunday that starts the school week a date falls in. A week runs
// Saturday to Friday, so a teacher who picks the Saturday, the Monday or the
// Tuesday of a week still lands on that week's Sunday — the date the app
// offers as "الأسبوع الأول، الثاني…". Every screen that reads or saves a
// week's marks goes through this, so one week is always one weekStart.
const toWeekStart = (value) => {
  const date = normalizeDate(value);
  if (!date) return null;
  const sinceSaturday = (date.getUTCDay() + 1) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceSaturday + 1));
};

const weekEnd = (weekStart) => {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const computeWeekScores = async (
  classroomId,
  subjectId,
  studentIds,
  weekStart,
  scheme = DEFAULT_SCHEME,
) => {
  const rangeEnd = weekEnd(weekStart);
  const rules = SCHEMES[scheme] || SCHEMES[DEFAULT_SCHEME];

  // On the daily register (School.attendanceMode "daily") there is one
  // register a day, taken in the first period, not one per lesson — so a
  // subject's مواظبة is read off the student's days at school that week,
  // the same figure for every subject, instead of that subject's lessons.
  const classroomDoc = await Classroom.findById(classroomId).select("school").lean();
  const daily = await isDailyMode(classroomDoc?.school);
  // A school that moved مواظبة وسلوك to the teacher's hand: from that week
  // on, only what the teacher entered counts — attendance no longer does.
  const conductEntered = isConductEntered(await conductEnteredFrom(classroomDoc?.school), weekStart);
  // A week with no تقييم أسبوعي in any school (utils/schoolMonths.js): the
  // column is empty whatever was filed under it, and the week's total is
  // the rest of its columns.
  const evalApplies = hasWeeklyEval(weekStart);

  const [
    attendanceRecords,
    homeworks,
    weeklyEvaluations,
    classworkEntries,
    overrides,
  ] = await Promise.all([
    Attendance.find({
      student: { $in: studentIds },
      ...(daily ? {} : { subject: subjectId }),
      date: { $gte: weekStart, $lte: rangeEnd },
      // Filtering on `subject` already excludes cover lessons, which carry
      // none — this states the rule outright rather than leaving the marks
      // resting on that side effect.
      ...Attendance.GRADED_ONLY,
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
    evalApplies
      ? WeeklyEvaluation.find({
          classroom: classroomId,
          subject: subjectId,
          weekStart,
        }).select("student score absent")
      : [],
    rules.classwork
      ? ClassworkNotebook.find({
          classroom: classroomId,
          subject: subjectId,
          weekStart,
        }).select("student score absent")
      : [],
    CourseworkOverride.find({
      student: { $in: studentIds },
      subject: subjectId,
      weekStart,
    }).select("student attendanceScore homeworkScore attendanceAbsent homeworkAbsent"),
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
  // A homework with no mark is worth one point, earned by handing it in
  // (utils/homeworkMarks.js).
  const homeworkById = new Map(homeworks.map((h) => [String(h._id), h]));
  const weekHomeworkMax = homeworks.reduce((sum, h) => sum + worthOf(h), 0);

  const homeworkResults = homeworkIds.length
    ? await HomeworkResult.find({
        homework: { $in: homeworkIds },
        student: { $in: studentIds },
      }).select("student homework score status")
    : [];

  // Since homework stopped being marked one by one (the teacher gives the
  // week's الواجب mark directly — a CourseworkOverride homeworkScore), most
  // weeks have homework set but no HomeworkResult at all. A student with no
  // result that week has no computed mark: not entered, rather than zero.
  const homeworkByStudent = new Map();
  homeworkResults.forEach((record) => {
    const key = record.student.toString();
    const earned = earnedOn(record, homeworkById.get(String(record.homework)));
    homeworkByStudent.set(key, (homeworkByStudent.get(key) || 0) + earned);
  });

  const weeklyByStudent = new Map();
  const weeklyAbsent = new Set();
  weeklyEvaluations.forEach((record) => {
    weeklyByStudent.set(record.student.toString(), record.score);
    if (isAbsent(record.absent, record.score)) weeklyAbsent.add(record.student.toString());
  });

  const classworkByStudent = new Map();
  const classworkAbsent = new Set();
  classworkEntries.forEach((record) => {
    classworkByStudent.set(record.student.toString(), record.score);
    if (isAbsent(record.absent, record.score)) classworkAbsent.add(record.student.toString());
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
    // Classic works مواظبة out from the attendance rate. weekly40 has no
    // formula — the teacher enters مواظبة وسلوك, so there is nothing to
    // compute and the only value is the one they set.
    const computedAttendance =
      !rules.attendanceComputed || conductEntered || attendanceRate === null
        ? null
        : round1(attendanceRate * 3 + 2);

    const homeworkEarned = homeworkByStudent.get(key);
    const computedHomework =
      weekHomeworkMax > 0 && homeworkEarned !== undefined
        ? round1((homeworkEarned / weekHomeworkMax) * rules.max.homeworkScore)
        : null;

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
      // Two places, not one: marks come in quarters (4.25), and a week of
      // them must add up to what the teacher entered, not to 14.3 for 14.25.
      total: Math.round(total * 100) / 100,
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
      // The columns that read «غ»: a 0, counted as 0 above, shown as absent
      // (utils/absentMark.js).
      absent: {
        attendanceScore: hasAttendanceOverride && isAbsent(override.attendanceAbsent, attendanceScore),
        homeworkScore: hasHomeworkOverride && isAbsent(override.homeworkAbsent, homeworkScore),
        weeklyEvalScore: weeklyAbsent.has(key) && weeklyEvalScore !== null,
        classworkScore: classworkAbsent.has(key) && classworkScore !== null,
      },
      // False in a week with no تقييم أسبوعي (utils/schoolMonths.js).
      weeklyEvalApplies: evalApplies,
    };
  });

  return scores;
};

// One student's month — the average of the totals of their recorded weeks,
// as a whole mark or a half (utils/halfMarks.js). A week with no تقييم
// أسبوعي would otherwise pull the month down by the whole column, so there
// it stands at the average of the month's other evaluations: the month's
// weekly evaluation is the average of the weeks that had one, and its other
// columns the average of every week, which is what the paper adds up to.
// `weeks` are { weekStart, total, weeklyEvalScore } — the student's entries
// of the weeks recorded in the month. With every week evaluated it is
// simply the average of the totals.
//
// While the month has no evaluated week yet (its first is the one without,
// as الشهر الثاني opens on the sixth), there is nothing to stand in for the
// evaluation, so such a week counts at its own share of the marks it has —
// 18.5 of 20 is 37 of 40 — rather than 18.5 of 40 (Mohamed, 2026-10-31: a
// week with no evaluation mustn't take from the total). `scheme` gives the
// week's total and the evaluation's share; without it, as before.
const monthAverage = (weeks, scheme = null) => {
  const recorded = weeks.filter((w) => w && w.total !== null && w.total !== undefined);
  const evaluated = recorded
    .filter((w) => hasWeeklyEval(w.weekStart))
    .map((w) => w.weeklyEvalScore)
    .filter((v) => v !== null && v !== undefined);
  const evalMean = evaluated.length ? evaluated.reduce((a, b) => a + b, 0) / evaluated.length : null;
  const rules = scheme ? SCHEMES[scheme] : null;
  const rest = rules ? rules.weekTotal - (rules.max.weeklyEvalScore || 0) : 0;
  const scale = rules && rest > 0 && rest < rules.weekTotal ? rules.weekTotal / rest : null;
  return averageToHalf(
    recorded.map((w) => {
      if (hasWeeklyEval(w.weekStart)) return w.total;
      if (evalMean !== null) return w.total + evalMean;
      return scale ? w.total * scale : w.total;
    }),
  );
};

// A school month's four weeks (utils/schoolMonths.js), each scored, or with
// `scores: null` where nothing is recorded yet for the class (a week still
// to come, or one the teacher hasn't reached), so a month's average leaves
// that week out instead of counting it as zero.
const computeMonthScores = async (classroomId, subjectId, studentIds, month, scheme = DEFAULT_SCHEME) => {
  const rules = SCHEMES[scheme] || SCHEMES[DEFAULT_SCHEME];
  const where = { classroom: classroomId, subject: subjectId, weekStart: { $in: month.weekStarts } };
  const [evaluated, adjusted, notebook] = await Promise.all([
    WeeklyEvaluation.find(where).distinct("weekStart"),
    CourseworkOverride.find(where).distinct("weekStart"),
    rules.classwork ? ClassworkNotebook.find(where).distinct("weekStart") : [],
  ]);
  // An evaluation filed under a week that has none doesn't make the week
  // recorded on its own (utils/schoolMonths.js).
  const recorded = new Set(
    [...evaluated.filter(hasWeeklyEval), ...adjusted, ...notebook].map((d) => new Date(d).getTime()),
  );

  const weeklyScores = [];
  for (const weekStart of month.weekStarts) {
    // eslint-disable-next-line no-await-in-loop -- four weeks.
    const scores = recorded.has(weekStart.getTime())
      ? await computeWeekScores(classroomId, subjectId, studentIds, weekStart, scheme)
      : null;
    weeklyScores.push({ weekStart, scores });
  }
  return weeklyScores;
};

module.exports = {
  computeWeekScores,
  computeMonthScores,
  monthAverage,
  normalizeDate,
  toWeekStart,
  weekEnd,
  MAX_SCORES,
  maxScoresFor,
};
