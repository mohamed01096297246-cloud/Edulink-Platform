const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
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
const { writeSheetPdf } = require("../utils/sheetPdf");
const { schemeForClassroom } = require("../utils/gradebook");
const { computeTerm40 } = require("../utils/term40");
const { schoolMonth, schoolMonthStartingIn, monthsBegun } = require("../utils/schoolMonths");
// Shared with the weekly-evaluation screen, so what the teacher edits on
// screen is literally the same number that lands in the printed register.
const { computeWeekScores, computeMonthScores, toWeekStart } = require("../utils/weekScores");

// The register goes out as the workbook, or — with ?format=pdf — as a PDF
// drawn from that same workbook (utils/sheetPdf), which any phone opens
// without a spreadsheet app. Without the parameter it stays Excel, so an app
// version from before the PDF keeps getting what it asks for.
const sendRegister = async (req, res, workbook, kind) => {
  if (req.query.format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="grade-register-${kind}.pdf"`);
    await new Promise((resolve, reject) => {
      res.on("finish", resolve);
      res.on("error", reject);
      writeSheetPdf(workbook.worksheets[0], res);
    });
    return undefined;
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="grade-register-${kind}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
  return undefined;
};

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
    const weekStart = toWeekStart(req.query.weekStart);

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

    await sendRegister(req, res, workbook, "week");
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const isoDay = (date) => date.toISOString().slice(0, 10);

// The school months a teacher can print so far: four school weeks each
// (utils/schoolMonths.js), oldest first, with the school days each covers.
exports.listRegisterMonths = async (req, res) => {
  try {
    const months = monthsBegun(new Date());
    const latest = months[months.length - 1].month;
    res.status(200).json({
      success: true,
      data: months.map((m) => ({
        month: m.month,
        term: m.term,
        label: m.label,
        from: isoDay(m.from),
        to: isoDay(m.to),
        current: m.month === latest,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The month sheet: a school month's four weeks and their average. The
// month comes as ?schoolMonth=n; an app from before school months sends a
// calendar ?month&year, read as the school month that starts in it.
exports.exportMonthlyRegister = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const legacy = req.query.schoolMonth === undefined;
    const month = legacy
      ? schoolMonthStartingIn(Number(req.query.month), Number(req.query.year))
      : schoolMonth(Number(req.query.schoolMonth));

    if (!month) {
      return res.status(400).json({
        success: false,
        message:
          legacy && req.query.month
            ? "الشهر في السجل بقى كل 4 أسابيع دراسة. اقفل التطبيق وافتحه تاني عشان يتحدّث، واختار الشهر من جديد."
            : "اختر الشهر.",
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

    // The classroom's own scheme decides both the arithmetic and the form
    // the sheet is laid out on (utils/gradebook.js).
    const scheme = await schemeForClassroom(classroom);
    const weeklyScores = await computeMonthScores(
      classroomId,
      subjectId,
      students.map((s) => s._id),
      month,
      scheme,
    );

    if (!weeklyScores.some(({ scores }) => scores)) {
      return res.status(404).json({
        success: false,
        message: `مفيش درجات مسجّلة للفصل ده في ${month.label}.`,
      });
    }

    const build = scheme === "weekly40" ? buildMonth40Workbook : buildMonthlyRegisterWorkbook;
    const workbook = build({
      subjectName: subjectDoc?.name || "",
      classroomName: classroom.name,
      month,
      students,
      weeklyScores,
    });

    await sendRegister(req, res, workbook, "month");
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

    await sendRegister(req, res, workbook, "term");
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
