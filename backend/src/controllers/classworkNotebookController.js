const ClassworkNotebook = require("../models/ClassworkNotebook");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { toWeekStart } = require("../utils/weekScores");
const { rosterWhere } = require("../utils/secondLanguage");
const { isAbsent } = require("../utils/absentMark");
const { weekName, marksBefore, tellMarks } = require("../utils/studentNotices");

exports.getClassroomClassworkNotebook = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const weekStart = toWeekStart(req.query.weekStart);

    if (!weekStart) {
      return res.status(400).json({
        success: false,
        message: "اختر تاريخ بداية الأسبوع أولًا.",
      });
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

    const entries = await ClassworkNotebook.find({
      classroom: classroomId,
      subject: subjectId,
      weekStart,
    });

    const scores = {};
    // The pupils whose 0 reads «غ» (utils/absentMark.js).
    const absent = {};
    entries.forEach((entry) => {
      scores[entry.student.toString()] = entry.score;
      if (isAbsent(entry.absent, entry.score)) absent[entry.student.toString()] = true;
    });

    return res.status(200).json({
      success: true,
      data: { students, scores, absent, weekStart },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBulkClassworkNotebook = async (req, res) => {
  try {
    const { classroomId, weekStart: rawWeekStart, gradesList } = req.body;
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

    if (!gradesList || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    // Any number from 0 to 5.
    const hasInvalidScore = gradesList.some(
      (record) =>
        !Number.isFinite(Number(record.score)) ||
        record.score < 0 ||
        record.score > 5,
    );

    if (hasInvalidScore) {
      return res.status(400).json({
        success: false,
        message: "الدرجات لازم تكون بين 0 و5، رقم صحيح أو بربع أو نص درجة (زي 4.5 أو 3.25).",
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
      requestedSubjectId: req.body.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    // «غ» stays on a 0 saved back unchanged; any other mark takes it off
    // (utils/absentMark.js).
    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: subjectId,
          weekStart,
        },
        update: {
          $set: {
            score: record.score,
            classroom: classroomId,
            teacher: req.user.id,
            school: req.user.school,
          },
          ...(Number(record.score) !== 0 ? { $unset: { absent: "" } } : {}),
        },
        upsert: true,
      },
    }));

    // What each student had, to tell only a mark that is new or different.
    const before = marksBefore(
      await ClassworkNotebook.find({
        subject: subjectId,
        weekStart,
        student: { $in: gradesList.map((record) => record.studentId) },
      })
        .select("student score")
        .lean(),
      (d) => ({ score: d.score }),
    );

    await ClassworkNotebook.bulkWrite(bulkOps);

    await tellMarks({
      subjectId,
      when: weekName(weekStart),
      columns: { score: { label: "كراسة الحصة", max: 5 } },
      before,
      after: gradesList.map((record) => ({ studentId: record.studentId, marks: { score: record.score } })),
      createdBy: req.user.id,
      school: req.user.school,
    });

    return res.status(200).json({
      success: true,
      message: "تم حفظ درجات كراسة الحصة بنجاح",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
