const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const User = require("../models/User");
const {
  buildWeeklyRegisterWorkbook,
  buildMonthlyRegisterWorkbook,
} = require("../utils/gradeRegisterExcel");

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

const sortByArabicName = (students) =>
  [...students].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(
      `${b.firstName} ${b.lastName}`,
      "ar",
    ),
  );

// The same three "أعمال السنة" ingredients courseworkController rolls up
// for the whole term, computed for just one [weekStart, weekStart+6 days]
// window instead — one register column-group per week.
const computeWeekScores = async (classroomId, subjectId, studentIds, weekStart) => {
  const rangeEnd = weekEnd(weekStart);

  const [attendanceRecords, homeworks, weeklyEvaluations] = await Promise.all([
    Attendance.find({
      student: { $in: studentIds },
      subject: subjectId,
      date: { $gte: weekStart, $lte: rangeEnd },
    }).select("student status"),
    Homework.find({
      classroom: classroomId,
      subject: subjectId,
      dueDate: { $gte: weekStart, $lte: rangeEnd },
    }).select("_id totalMarks"),
    WeeklyEvaluation.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart,
    }).select("student score"),
  ]);

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

  const scores = {};
  studentIds.forEach((id) => {
    const key = id.toString();

    const attendance = attendanceByStudent.get(key);
    const attendanceRate =
      attendance && attendance.total > 0 ? attendance.attended / attendance.total : null;
    const attendanceScore = attendanceRate === null ? null : round1(attendanceRate * 3 + 2);

    const homeworkEarned = homeworkByStudent.get(key) || 0;
    const homeworkScore =
      weekHomeworkMax > 0 ? round1((homeworkEarned / weekHomeworkMax) * 5) : null;

    const weeklyEvalScore = weeklyByStudent.has(key) ? weeklyByStudent.get(key) : null;

    const total = [attendanceScore, homeworkScore, weeklyEvalScore]
      .filter((v) => v !== null && !Number.isNaN(v))
      .reduce((a, b) => a + b, 0);

    scores[key] = {
      attendanceScore,
      homeworkScore,
      weeklyEvalScore,
      total: round1(total),
    };
  });

  return scores;
};

exports.exportWeeklyRegister = async (req, res) => {
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
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id).populate("subject", "name");

    const students = sortByArabicName(
      await Student.find({ classroom: classroomId, active: true }).select(
        "firstName lastName",
      ),
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "الفصل ده مفيهوش طلاب نشطين.",
      });
    }

    const studentIds = students.map((s) => s._id);
    const scores = await computeWeekScores(
      classroomId,
      teacher.subject._id,
      studentIds,
      weekStart,
    );

    const workbook = buildWeeklyRegisterWorkbook({
      subjectName: teacher.subject?.name || "",
      classroomName: classroom.name,
      weekStart,
      students,
      scores,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="grade-register-week.xlsx"',
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportMonthlyRegister = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "اختر الشهر والسنة.",
      });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id).populate("subject", "name");

    const monthStart = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const monthEnd = new Date(
      Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999),
    );

    // "Which weeks exist" for a classroom/subject is defined by whichever
    // weeks the teacher actually recorded a تقييم أسبوعي for — التقييم
    // الأسبوعي is the only place weekly boundaries are chosen in this
    // system, so it drives the register's column set too.
    const weekStarts = (
      await WeeklyEvaluation.find({
        classroom: classroomId,
        subject: teacher.subject._id,
        weekStart: { $gte: monthStart, $lte: monthEnd },
      }).distinct("weekStart")
    ).sort((a, b) => new Date(a) - new Date(b));

    if (weekStarts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "مفيش تقييم أسبوعي مسجّل لهذا الفصل في هذا الشهر.",
      });
    }

    const students = sortByArabicName(
      await Student.find({ classroom: classroomId, active: true }).select(
        "firstName lastName",
      ),
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "الفصل ده مفيهوش طلاب نشطين.",
      });
    }

    const studentIds = students.map((s) => s._id);

    const weeklyScores = [];
    for (const weekStart of weekStarts) {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose,
      // handful of weeks per month at most.
      const scores = await computeWeekScores(
        classroomId,
        teacher.subject._id,
        studentIds,
        weekStart,
      );
      weeklyScores.push({ weekStart, scores });
    }

    const workbook = buildMonthlyRegisterWorkbook({
      subjectName: teacher.subject?.name || "",
      classroomName: classroom.name,
      month: Number(month),
      year: Number(year),
      students,
      weekStarts,
      weeklyScores,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="grade-register-month.xlsx"',
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
