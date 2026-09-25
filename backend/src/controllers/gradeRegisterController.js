const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const User = require("../models/User");
const Subject = require("../models/Subject");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const {
  buildWeeklyRegisterWorkbook,
  buildMonthlyRegisterWorkbook,
  buildWeek40Workbook,
  buildMonth40Workbook,
  buildTerm40Workbook,
} = require("../utils/gradeRegisterExcel");
const { schemeForClassroom } = require("../utils/gradebook");
const { monthWeekScores, computeTerm40 } = require("../utils/term40");
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

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
    });
    if (!subjectId) return undefined;

    // The register prints the subject on its header, so the name is fetched
    // for the sheet the resolver just settled on rather than off the teacher.
    const subjectDoc = await Subject.findById(subjectId).select("name");

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
    // The classroom's own scheme decides both the arithmetic and the form
    // the sheet is laid out on (utils/gradebook.js).
    const scheme = await schemeForClassroom(classroom);
    const scores = await computeWeekScores(
      classroomId,
      subjectId,
      studentIds,
      weekStart,
      scheme,
    );

    const build = scheme === "weekly40" ? buildWeek40Workbook : buildWeeklyRegisterWorkbook;
    const workbook = build({
      subjectName: subjectDoc?.name || "",
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

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
    });
    if (!subjectId) return undefined;

    // The register prints the subject on its header, so the name is fetched
    // for the sheet the resolver just settled on rather than off the teacher.
    const subjectDoc = await Subject.findById(subjectId).select("name");

    if ((await schemeForClassroom(classroom)) === "weekly40") {
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

      const { weekStarts, weeklyScores } = await monthWeekScores(
        classroomId,
        subjectId,
        students.map((s) => s._id),
        Number(month),
        Number(year),
      );
      if (weekStarts.length === 0) {
        return res.status(404).json({
          success: false,
          message: "مفيش درجات أسبوعية مسجّلة لهذا الفصل في هذا الشهر.",
        });
      }

      const workbook = buildMonth40Workbook({
        subjectName: subjectDoc?.name || "",
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
      return res.end();
    }

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
        subject: subjectId,
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
        subjectId,
        studentIds,
        weekStart,
      );
      weeklyScores.push({ weekStart, scores });
    }

    const workbook = buildMonthlyRegisterWorkbook({
      subjectName: subjectDoc?.name || "",
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

// The term sheet — أعمال السنة — on the weekly40 scheme only: each month's
// average, their average, the two tests, the total out of 70 and the days
// absent (utils/term40.js). A classic classroom has no such sheet.
exports.exportTermRegister = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const term = Number(req.query.term) === 2 ? 2 : Number(req.query.term) === 1 ? 1 : null;
    if (!term) {
      return res.status(400).json({ success: false, message: "اختر الترم." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }
    if ((await schemeForClassroom(classroom)) !== "weekly40") {
      return res.status(400).json({
        success: false,
        message: "سجل أعمال السنة بالترم مش متاح لنظام الدرجات بتاع الفصل ده.",
      });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
    });
    if (!subjectId) return undefined;

    const subjectDoc = await Subject.findById(subjectId).select("name");
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

    const { months, rows } = await computeTerm40({ classroom, subjectId, students, term });

    const workbook = buildTerm40Workbook({
      subjectName: subjectDoc?.name || "",
      classroomName: classroom.name,
      term,
      academicYear: classroom.academicYear,
      students,
      months,
      rows,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="grade-register-term.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
