const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const User = require("../models/User");
const {
  buildWeeklyRegisterWorkbook,
  buildMonthlyRegisterWorkbook,
} = require("../utils/gradeRegisterExcel");
// Shared with the weekly-evaluation screen, so what the teacher edits on
// screen is literally the same number that lands in the printed register.
const { computeWeekScores, normalizeDate } = require("../utils/weekScores");

const sortByArabicName = (students) =>
  [...students].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(
      `${b.firstName} ${b.lastName}`,
      "ar",
    ),
  );

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
