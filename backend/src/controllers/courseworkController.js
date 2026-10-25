const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const MonthlyGrade = require("../models/MonthlyGrade");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { getCurrentTermWindow } = require("../utils/termWindow");
const {
  computeWeekScores,
  toWeekStart,
  maxScoresFor,
} = require("../utils/weekScores");
const {
  schemeForClassroom,
  conductEnteredFrom,
  isConductEntered,
} = require("../utils/gradebook");
const { isDailyMode } = require("../utils/dailyAttendance");
const { worthOf, earnedOn } = require("../utils/homeworkMarks");
const { averageToHalf } = require("../utils/halfMarks");
const { rosterWhere } = require("../utils/secondLanguage");
const { weeksWithoutWeeklyEval } = require("../utils/schoolMonths");

const round1 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10;

// The auto-computed slices of "أعمال السنة" for the current term — الحضور
// والواجب واختبار الشهر تُحسب من سجلات فعلية (حضور/واجبات/درجات شهرية).
// التقييم الأسبوعي وكراسة الحصة (10 و5) هما الاثنين الوحيدين اللي المعلم
// بيسجلهم يدويًا أسبوع بأسبوع (انظر weeklyEvaluationController و
// classworkNotebookController) — لكن متوسطهم على مدار الترم بيتحسب هنا
// زي باقي الأعمدة عشان يبان في مكان واحد.
exports.getClassroomCoursework = async (req, res) => {
  try {
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    const { dateStart, dateEnd, monthYearPairs } = getCurrentTermWindow(
      classroom.academicYear,
    );

    const students = await Student.find({
      classroom: classroomId,
      active: true,
      ...(await rosterWhere(classroomId, subjectId)),
    })
      .select("firstName lastName")
      .sort({ firstName: 1 });

    const studentIds = students.map((s) => s._id);

    // ---- مواظبة وسلوك: (نسبة الحضور × 3) + 2 ----
    // On the daily register the student's days at school stand for every
    // subject (see utils/weekScores.js).
    const daily = await isDailyMode(classroom.school);
    const attendanceRecords = await Attendance.find({
      student: { $in: studentIds },
      ...(daily ? {} : { subject: subjectId }),
      date: { $gte: dateStart, $lte: dateEnd },
      // Cover lessons never carry a subject, so they are already out — kept
      // explicit because this figure becomes a mark.
      ...Attendance.GRADED_ONLY,
    }).select("student status");

    const attendanceByStudent = new Map();
    attendanceRecords.forEach((record) => {
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

    // ---- الواجب المنزلي: (مجموع الدرجات ÷ مجموع الحد الأقصى) × 5 ----
    const homeworks = await Homework.find({
      classroom: classroomId,
      subject: subjectId,
      dueDate: { $gte: dateStart, $lte: dateEnd },
    }).select("_id totalMarks");

    const homeworkIds = homeworks.map((h) => h._id);
    const maxMarksByHomework = new Map(
      homeworks.map((h) => [h._id.toString(), h.totalMarks]),
    );
    const homeworkById = new Map(homeworks.map((h) => [h._id.toString(), h]));
    const termHomeworkMax = homeworks.reduce((sum, h) => sum + worthOf(h), 0);

    const homeworkResults = await HomeworkResult.find({
      homework: { $in: homeworkIds },
      student: { $in: studentIds },
    }).select("student homework score status");

    const homeworkByStudent = new Map();
    homeworkResults.forEach((record) => {
      const key = record.student.toString();
      if (!homeworkByStudent.has(key)) {
        homeworkByStudent.set(key, 0);
      }
      const earned = earnedOn(record, homeworkById.get(record.homework.toString()));
      homeworkByStudent.set(key, homeworkByStudent.get(key) + earned);
    });

    // ---- اختبار الشهر: متوسط شهور الترم اللي اتسجلت (من 15) ----
    const monthlyGrades = await MonthlyGrade.find({
      classroom: classroomId,
      subject: subjectId,
      $or: monthYearPairs,
    }).select("student grade");

    const monthlyByStudent = new Map();
    monthlyGrades.forEach((record) => {
      const key = record.student.toString();
      if (!monthlyByStudent.has(key)) monthlyByStudent.set(key, []);
      monthlyByStudent.get(key).push(record.grade);
    });

    // ---- التقييم الأسبوعي: متوسط أسابيع الترم اللي اتسجلت (من 10) ----
    // A week with no تقييم أسبوعي (utils/schoolMonths.js) is left out,
    // whatever was filed under it.
    const weeklyEvaluations = await WeeklyEvaluation.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart: { $gte: dateStart, $lte: dateEnd, $nin: weeksWithoutWeeklyEval() },
    }).select("student score");

    const weeklyByStudent = new Map();
    weeklyEvaluations.forEach((record) => {
      const key = record.student.toString();
      if (!weeklyByStudent.has(key)) weeklyByStudent.set(key, []);
      weeklyByStudent.get(key).push(record.score);
    });

    // ---- كراسة الحصة: متوسط أسابيع الترم اللي اتسجلت (من 5) ----
    const classworkEntries = await ClassworkNotebook.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart: { $gte: dateStart, $lte: dateEnd },
    }).select("student score");

    const classworkByStudent = new Map();
    classworkEntries.forEach((record) => {
      const key = record.student.toString();
      if (!classworkByStudent.has(key)) classworkByStudent.set(key, []);
      classworkByStudent.get(key).push(record.score);
    });

    const data = students.map((student) => {
      const key = student._id.toString();

      const attendance = attendanceByStudent.get(key);
      const attendanceRate = attendance && attendance.total > 0
        ? attendance.attended / attendance.total
        : null;
      const attendanceBehaviorScore =
        attendanceRate === null ? null : round1(attendanceRate * 3 + 2);

      const homeworkEarned = homeworkByStudent.get(key) || 0;
      const homeworkScore =
        termHomeworkMax > 0
          ? round1((homeworkEarned / termHomeworkMax) * 5)
          : null;

      // Averages over the term, each as a whole mark or a half
      // (utils/halfMarks).
      const monthlyTestScore = averageToHalf(monthlyByStudent.get(key) || []);
      const weeklyEvalScore = averageToHalf(weeklyByStudent.get(key) || []);
      const classworkNotebookScore = averageToHalf(classworkByStudent.get(key) || []);

      const subtotal = [
        attendanceBehaviorScore,
        homeworkScore,
        monthlyTestScore,
        weeklyEvalScore,
        classworkNotebookScore,
      ]
        .filter((v) => v !== null && !Number.isNaN(v))
        .reduce((a, b) => a + b, 0);

      return {
        studentId: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        attendanceRate:
          attendanceRate === null ? null : round1(attendanceRate * 100),
        attendanceBehaviorScore,
        homeworkScore,
        monthlyTestScore,
        weeklyEvalScore,
        classworkNotebookScore,
        subtotal: round1(subtotal),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        students: data,
        maxScores: {
          attendanceBehaviorScore: 5,
          homeworkScore: 5,
          monthlyTestScore: 15,
          weeklyEvalScore: 10,
          classworkNotebookScore: 5,
          subtotal: 40,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// The same four columns as above, but for one week instead of the whole
// term — this is what the weekly-evaluation screen shows next to each
// student, and it's computed by the exact same helper the printed Excel
// register uses, so the two can never disagree.
exports.getClassroomWeekCoursework = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const weekStart = toWeekStart(req.query.weekStart);

    if (!weekStart) {
      return res.status(400).json({
        success: false,
        message: "اختر تاريخ بداية الأسبوع أولًا.",
      });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    const students = await Student.find({
      classroom: classroomId,
      active: true,
      ...(await rosterWhere(classroomId, subjectId)),
    })
      .select("firstName lastName gender")
      .sort({ firstName: 1 });

    const scheme = await schemeForClassroom(classroom);
    const scores = await computeWeekScores(
      classroomId,
      subjectId,
      students.map((s) => s._id),
      weekStart,
      scheme,
    );

    return res.status(200).json({
      success: true,
      data: {
        students: students.map((student) => ({
          studentId: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          gender: student.gender,
          ...scores[student._id.toString()],
        })),
        // The app lays the week out from these: which columns exist and
        // what each is out of, for this classroom's scheme.
        scheme,
        maxScores: maxScoresFor(scheme),
        // True when this week's مواظبة وسلوك is the teacher's to enter
        // rather than worked out from attendance (School.conductEnteredFrom).
        conductEntered:
          scheme === "weekly40" ||
          isConductEntered(await conductEnteredFrom(classroom.school), weekStart),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Editable straight from the weekly-evaluation screen. Two of these columns
// are auto-computed (مواظبة وسلوك، الواجب) and get a CourseworkOverride row;
// كراسة الحصة is already a manually-entered number, so it's written to its
// own collection instead of shadowed by an override — otherwise the same
// score would live in two places and the notebook screen would show one
// value while this screen showed another.
const EDITABLE_COLUMNS = ["attendanceScore", "homeworkScore", "classworkScore"];

// A week before the school moved مواظبة وسلوك to the teacher's hand
// (School.conductEnteredFrom) shows each student the mark worked out from
// attendance. The app before 2026-10-17 sent only the students whose mark
// the teacher changed, so the rest of a class the teacher saved as shown
// never reached the server, and the week stayed short. A مواظبة save for
// such a week therefore also records the full mark for every other student
// with nothing recorded yet who was shown the full mark. The current app
// sends every unrecorded student itself, so for it this finds nobody left.
// A student shown less (absences) is left for the teacher: مواظبة وسلوك is
// theirs to judge, not the attendance register's.
const conductShownToTheRest = async ({ classroom, subjectId, weekStart, list, scheme }) => {
  const savesConduct = list.some(
    (entry) => entry.attendanceScore !== null && entry.attendanceScore !== undefined,
  );
  if (!savesConduct || scheme !== "classic") return [];

  const from = await conductEnteredFrom(classroom.school);
  if (!from || isConductEntered(from, weekStart)) return [];

  const sent = new Set(list.map((entry) => String(entry.studentId)));
  const others = (
    await Student.find({
      classroom: classroom._id,
      active: true,
      ...(await rosterWhere(classroom._id, subjectId)),
    }).select("_id")
  )
    .map((s) => s._id)
    .filter((id) => !sent.has(String(id)));
  if (others.length === 0) return [];

  const full = maxScoresFor(scheme).attendanceScore;
  const scores = await computeWeekScores(classroom._id, subjectId, others, weekStart, scheme);
  return others
    .filter((id) => {
      const score = scores[String(id)];
      return !score.overridden.attendanceScore && score.computed.attendanceScore === full;
    })
    .map((id) => ({ studentId: id, attendanceScore: full }));
};

exports.saveWeekCourseworkOverrides = async (req, res) => {
  try {
    const { classroomId, weekStart: rawWeekStart, list } = req.body;
    const weekStart = toWeekStart(rawWeekStart);

    if (!classroomId) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الفصل الأول." });
    }

    if (!weekStart) {
      return res.status(400).json({
        success: false,
        message: "اختر تاريخ بداية الأسبوع أولًا.",
      });
    }

    if (!Array.isArray(list) || list.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "مفيش أي تعديلات للحفظ." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    // The columns this classroom's scheme has, and what each is out of.
    const scheme = await schemeForClassroom(classroom);
    const maxScores = maxScoresFor(scheme);

    // A value of `null` is a deliberate "put this column back to the
    // automatic calculation"; a missing key means "leave it alone". Anything
    // else has to be a whole mark, or one and a quarter, a half or three
    // quarters (4.5, 3.25), inside the column's own maximum — this
    // is the server-side half of the cap the score buttons enforce in the
    // app, so a stale or tampered client can't push a 7 into a 5-mark
    // column. A column the scheme doesn't have (كراسة الحصة on weekly40)
    // is refused outright.
    for (const entry of list) {
      if (!entry || !entry.studentId) {
        return res
          .status(400)
          .json({ success: false, message: "بيانات الطالب ناقصة." });
      }

      for (const column of EDITABLE_COLUMNS) {
        if (!Object.prototype.hasOwnProperty.call(entry, column)) continue;

        const value = entry[column];
        const max = maxScores[column];

        if (max === undefined) {
          return res.status(400).json({
            success: false,
            message: "العمود ده مش جزء من نظام الدرجات بتاع الفصل ده.",
          });
        }

        if (value === null) continue;

        if (!Number.isInteger(Number(value) * 4) || value < 0 || value > max) {
          return res.status(400).json({
            success: false,
            message: `الدرجة لازم تكون بين 0 و${max}، رقم صحيح أو بربع أو نص درجة (زي 4.5 أو 3.25).`,
          });
        }
      }
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.body.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    const overrideOps = [];
    const classworkOps = [];
    const shown = await conductShownToTheRest({ classroom, subjectId, weekStart, list, scheme });

    [...list, ...shown].forEach((entry) => {
      const key = { student: entry.studentId, subject: subjectId, weekStart };

      const set = {};
      const unset = {};

      ["attendanceScore", "homeworkScore"].forEach((column) => {
        if (!Object.prototype.hasOwnProperty.call(entry, column)) return;

        if (entry[column] === null) unset[column] = "";
        else set[column] = Number(entry[column]);
      });

      if (Object.keys(set).length > 0 || Object.keys(unset).length > 0) {
        const update = {
          $set: {
            ...set,
            classroom: classroomId,
            teacher: req.user.id,
            school: req.user.school,
          },
        };
        if (Object.keys(unset).length > 0) update.$unset = unset;

        overrideOps.push({ updateOne: { filter: key, update, upsert: true } });
      }

      if (Object.prototype.hasOwnProperty.call(entry, "classworkScore")) {
        if (entry.classworkScore === null) {
          classworkOps.push({ deleteOne: { filter: key } });
        } else {
          classworkOps.push({
            updateOne: {
              filter: key,
              update: {
                $set: {
                  score: Number(entry.classworkScore),
                  classroom: classroomId,
                  teacher: req.user.id,
                  school: req.user.school,
                },
              },
              upsert: true,
            },
          });
        }
      }
    });

    if (overrideOps.length > 0) await CourseworkOverride.bulkWrite(overrideOps);
    if (classworkOps.length > 0) await ClassworkNotebook.bulkWrite(classworkOps);

    return res
      .status(200)
      .json({ success: true, message: "تم حفظ التعديلات بنجاح" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
