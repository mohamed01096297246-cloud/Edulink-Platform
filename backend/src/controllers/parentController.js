const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const Behavior = require("../models/Behavior");
const HomeworkResult = require("../models/HomeworkResult");
const Result = require("../models/Result");
const User = require("../models/User");
const Schedule = require("../models/Schedule");
const Subject = require("../models/Subject");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const CourseworkOverride = require("../models/CourseworkOverride");
const { buildStudentReport } = require("../utils/reportBuilder");
const { SCHEMES, schemeForClassroom } = require("../utils/gradebook");
const { computeWeekScores, toWeekStart, weekEnd } = require("../utils/weekScores");

exports.getParentDashboard = async (req, res) => {
  try {
    const parentUser = await User.findById(req.user.id);
    const linkedIds = parentUser?.linkedStudents || [];
    const students = await Student.find({
      $or: [{ parent: req.user.id }, { _id: { $in: linkedIds } }],
    }).populate("classroom", "name grade");

    if (!students || students.length === 0) {
      return res.status(200).json({
        parentName: req.user.firstName,
        children: [],
      });
    }

    const childrenData = await Promise.all(
      students.map(async (student) => {
        // Cover-lesson records are excluded here for the same reason they are
        // excluded from the report: they say nothing about the child's work
        // in any subject, so they must not shift the present/absent counts a
        // parent reads on the home screen.
        const attendance = await Attendance.find({
          student: student._id,
          ...Attendance.GRADED_ONLY,
        });
        const present = attendance.filter((a) => a.status === "present").length;
        const absent = attendance.filter((a) => a.status === "absent").length;

        const behaviors = await Behavior.find({ student: student._id })
          .populate("teacher", "firstName lastName")
          .sort({ createdAt: -1 });

        const homeworkResults = await HomeworkResult.find({
          student: student._id,
        })
          .populate("homework", "title subject")
          .sort({ createdAt: -1 });

        const examResults = await Result.find({ student: student._id })
          .populate("exam", "title subject totalMarks")
          .sort({ createdAt: -1 });

        return {
          studentInfo: {
            id: student._id,
            fullName: `${student.firstName} ${student.lastName}`,
            classroom: student.classroom ? student.classroom.name : "غير محدد",
            classroomId: student.classroom ? student.classroom._id : null,
            grade: student.classroom ? student.classroom.grade : "",
          },
          attendance: { present, absent, totalDays: attendance.length },
          behaviors,
          homeworkResults,
          examResults,
        };
      }),
    );
    res.status(200).json({
      parentName: req.user.firstName,
      children: childrenData,
    });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في السيرفر: " + err.message });
  }
};

const VALID_PERIODS = ["daily", "weekly", "monthly"];

exports.getStudentReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const period = VALID_PERIODS.includes(req.query.period)
      ? req.query.period
      : "weekly";

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const parentUser = await User.findById(req.user.id);
    const linkedIds = (parentUser?.linkedStudents || []).map((id) =>
      id.toString()
    );
    const isOwnChild =
      String(student.parent) === req.user.id ||
      linkedIds.includes(student._id.toString());

    if (!isOwnChild) {
      return res.status(403).json({
        message: "غير مصرح لك بعرض تقرير هذا الطالب.",
      });
    }

    const report = await buildStudentReport(studentId, period);

    res.status(200).json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في السيرفر: " + err.message });
  }
};

// Activity subjects carry no weekly evaluation worth showing a parent, so
// تقييم الأسبوع leaves them out. Names are compared loosely because each
// school spells them its own way (مكتبه / مكتبة، موسيقي / موسيقى،
// القرءان الكريم); تربية رياضية is Future's name for العاب.
const normalizeSubjectName = (name) =>
  String(name || "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ء/g, "")
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^ال/, ""))
    .join("");
const NOT_IN_WEEK_EVALUATION = new Set(
  ["العاب", "تربية رياضية", "مكتبة", "موسيقى", "تربية فنية", "القرآن الكريم"].map(normalizeSubjectName),
);

// تقييم الأسبوع: the week's التقييم الأسبوعي mark in every subject the child
// takes, each as a percentage of what the class's scheme marks it out of
// (10 classic, 20 weekly40). Without a weekStart it opens on the latest week
// the child has a mark in, so the parent never lands on an empty week that
// simply hasn't been marked yet.
exports.getWeekEvaluation = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const parentUser = await User.findById(req.user.id);
    const linkedIds = (parentUser?.linkedStudents || []).map(String);
    if (String(student.parent) !== req.user.id && !linkedIds.includes(String(student._id))) {
      return res.status(403).json({ message: "غير مصرح لك بعرض تقييم هذا الطالب." });
    }

    let weekStart = req.query.weekStart ? toWeekStart(req.query.weekStart) : null;
    if (!weekStart) {
      const latest = await WeeklyEvaluation.findOne({ student: student._id })
        .sort({ weekStart: -1 })
        .select("weekStart");
      weekStart = toWeekStart(latest ? latest.weekStart : new Date());
    }

    const [evaluations, scheduledSubjects, scheme] = await Promise.all([
      WeeklyEvaluation.find({
        student: student._id,
        weekStart: { $gte: weekStart, $lte: weekEnd(weekStart) },
      }).select("subject score"),
      student.classroom ? Schedule.distinct("subject", { classroom: student.classroom }) : [],
      student.classroom ? schemeForClassroom(student.classroom) : "classic",
    ]);
    const max = (SCHEMES[scheme] || SCHEMES.classic).max.weeklyEvalScore;

    const scoreOf = new Map(evaluations.map((e) => [String(e.subject), e.score]));
    const subjectIds = [...new Set([...scheduledSubjects.filter(Boolean).map(String), ...scoreOf.keys()])];
    const subjectDocs = await Subject.find({ _id: { $in: subjectIds } }).select("name");

    const subjects = subjectDocs
      .filter((s) => !NOT_IN_WEEK_EVALUATION.has(normalizeSubjectName(s.name)))
      .map((s) => {
        const score = scoreOf.has(String(s._id)) ? scoreOf.get(String(s._id)) : null;
        return {
          subjectId: s._id,
          name: s.name,
          score,
          max,
          percent: score === null ? null : Math.round((score / max) * 100),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));

    const marked = subjects.filter((s) => s.score !== null);
    const overall = marked.length
      ? Math.round((marked.reduce((sum, s) => sum + s.score, 0) / (marked.length * max)) * 100)
      : null;

    res.status(200).json({
      success: true,
      data: { weekStart: weekStart.toISOString().slice(0, 10), max, overall, subjects },
    });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في السيرفر: " + err.message });
  }
};

// درجة الواجب: the week's الواجب mark in every subject the child takes —
// out of 5 classic, 10 weekly40 — worked out exactly as the teacher's
// register does (utils/weekScores.js), so the parent reads the teacher's own
// number. Without a weekStart it opens on the latest week, up to this one,
// that the child has a mark in.
exports.getHomeworkWeek = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const parentUser = await User.findById(req.user.id);
    const linkedIds = (parentUser?.linkedStudents || []).map(String);
    if (String(student.parent) !== req.user.id && !linkedIds.includes(String(student._id))) {
      return res.status(403).json({ message: "غير مصرح لك بعرض درجات هذا الطالب." });
    }

    let weekStart = req.query.weekStart ? toWeekStart(req.query.weekStart) : null;
    if (!weekStart) {
      const thisWeek = toWeekStart(new Date());
      const latest = await CourseworkOverride.findOne({
        student: student._id,
        homeworkScore: { $ne: null },
        weekStart: { $lte: thisWeek },
      })
        .sort({ weekStart: -1 })
        .select("weekStart");
      weekStart = latest ? toWeekStart(latest.weekStart) : thisWeek;
    }

    const scheme = student.classroom ? await schemeForClassroom(student.classroom) : "classic";
    const max = (SCHEMES[scheme] || SCHEMES.classic).max.homeworkScore;

    const subjectIds = student.classroom
      ? (await Schedule.distinct("subject", { classroom: student.classroom })).filter(Boolean)
      : [];
    const subjectDocs = (await Subject.find({ _id: { $in: subjectIds } }).select("name")).filter(
      (s) => !NOT_IN_WEEK_EVALUATION.has(normalizeSubjectName(s.name)),
    );

    const subjects = (
      await Promise.all(
        subjectDocs.map(async (s) => {
          const scores = await computeWeekScores(student.classroom, s._id, [student._id], weekStart, scheme);
          const score = scores[String(student._id)]?.homeworkScore ?? null;
          return { subjectId: s._id, name: s.name, score, max };
        }),
      )
    ).sort((a, b) => a.name.localeCompare(b.name, "ar"));

    res.status(200).json({
      success: true,
      data: { weekStart: weekStart.toISOString().slice(0, 10), max, subjects },
    });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في السيرفر: " + err.message });
  }
};
