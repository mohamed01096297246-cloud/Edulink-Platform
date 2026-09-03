const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");

// Normalizes any date string/Date to UTC midnight, so "the week starting
// 2026-09-07" always matches regardless of what time of day it was saved.
const normalizeDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
};

exports.getClassroomWeeklyEvaluation = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const weekStart = normalizeDate(req.query.weekStart);

    if (!weekStart) {
      return res.status(400).json({
        success: false,
        message: "اختر تاريخ بداية الأسبوع أولًا.",
      });
    }

    const teacher = await User.findById(req.user.id);

    const students = await Student.find({ classroom: classroomId, active: true })
      .select("firstName lastName gender")
      .sort({ firstName: 1 });

    const evaluations = await WeeklyEvaluation.find({
      classroom: classroomId,
      subject: teacher.subject,
      weekStart,
    });

    const scores = {};
    evaluations.forEach((entry) => {
      scores[entry.student.toString()] = entry.score;
    });

    return res.status(200).json({
      success: true,
      data: { students, scores, weekStart },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBulkWeeklyEvaluation = async (req, res) => {
  try {
    const { classroomId, weekStart: rawWeekStart, gradesList } = req.body;
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

    if (!gradesList || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    const hasInvalidScore = gradesList.some(
      (record) =>
        !Number.isInteger(Number(record.score)) ||
        record.score < 0 ||
        record.score > 10,
    );

    if (hasInvalidScore) {
      return res.status(400).json({
        success: false,
        message: "الدرجات لازم تكون رقم صحيح من غير كسور، بين 0 و10.",
      });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);

    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: teacher.subject,
          weekStart,
        },
        update: {
          $set: {
            score: record.score,
            classroom: classroomId,
            teacher: req.user.id,
            school: req.user.school,
          },
        },
        upsert: true,
      },
    }));

    await WeeklyEvaluation.bulkWrite(bulkOps);

    return res.status(200).json({
      success: true,
      message: "تم حفظ التقييم الأسبوعي بنجاح",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
