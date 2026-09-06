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
const { getCurrentTermWindow } = require("../utils/termWindow");
const {
  computeWeekScores,
  normalizeDate,
  MAX_SCORES,
} = require("../utils/weekScores");

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
    const subjectId = teacher.subject;

    const { dateStart, dateEnd, monthYearPairs } = getCurrentTermWindow(
      classroom.academicYear,
    );

    const students = await Student.find({
      classroom: classroomId,
      active: true,
    })
      .select("firstName lastName")
      .sort({ firstName: 1 });

    const studentIds = students.map((s) => s._id);

    // ---- مواظبة وسلوك: (نسبة الحضور × 3) + 2 ----
    const attendanceRecords = await Attendance.find({
      student: { $in: studentIds },
      subject: subjectId,
      date: { $gte: dateStart, $lte: dateEnd },
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
    const termHomeworkMax = homeworks.reduce((sum, h) => sum + h.totalMarks, 0);

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
      const earned = record.status === "missing" ? 0 : record.score || 0;
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
    const weeklyEvaluations = await WeeklyEvaluation.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart: { $gte: dateStart, $lte: dateEnd },
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

    const average = (arr) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

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

      const monthlyTestScore = round1(average(monthlyByStudent.get(key) || []));
      // Each week's entry is already a whole number — averaging several of
      // them can still land on a fraction, but the weekly-evaluation column
      // never shows one, so round to the nearest whole number here too.
      const weeklyAverage = average(weeklyByStudent.get(key) || []);
      const weeklyEvalScore =
        weeklyAverage === null ? null : Math.round(weeklyAverage);

      // Same whole-number rounding as weeklyEvalScore — each week's entry
      // is already an integer, but an average of several can land on a
      // fraction, and the classwork-notebook column never shows one.
      const classworkAverage = average(classworkByStudent.get(key) || []);
      const classworkNotebookScore =
        classworkAverage === null ? null : Math.round(classworkAverage);

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
    const weekStart = normalizeDate(req.query.weekStart);

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

    const students = await Student.find({ classroom: classroomId, active: true })
      .select("firstName lastName")
      .sort({ firstName: 1 });

    const scores = await computeWeekScores(
      classroomId,
      teacher.subject,
      students.map((s) => s._id),
      weekStart,
    );

    return res.status(200).json({
      success: true,
      data: {
        students: students.map((student) => ({
          studentId: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          ...scores[student._id.toString()],
        })),
        maxScores: MAX_SCORES,
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

exports.saveWeekCourseworkOverrides = async (req, res) => {
  try {
    const { classroomId, weekStart: rawWeekStart, list } = req.body;
    const weekStart = normalizeDate(rawWeekStart);

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

    // A value of `null` is a deliberate "put this column back to the
    // automatic calculation"; a missing key means "leave it alone". Anything
    // else has to be a whole number inside the column's own maximum — this
    // is the server-side half of the cap the score buttons enforce in the
    // app, so a stale or tampered client can't push a 7 into a 5-mark
    // column.
    for (const entry of list) {
      if (!entry || !entry.studentId) {
        return res
          .status(400)
          .json({ success: false, message: "بيانات الطالب ناقصة." });
      }

      for (const column of EDITABLE_COLUMNS) {
        if (!Object.prototype.hasOwnProperty.call(entry, column)) continue;

        const value = entry[column];
        if (value === null) continue;

        const max = MAX_SCORES[column];

        if (!Number.isInteger(Number(value)) || value < 0 || value > max) {
          return res.status(400).json({
            success: false,
            message: `الدرجة لازم تكون رقم صحيح من غير كسور، بين 0 و${max}.`,
          });
        }
      }
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);

    const overrideOps = [];
    const classworkOps = [];

    list.forEach((entry) => {
      const key = { student: entry.studentId, subject: teacher.subject, weekStart };

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
