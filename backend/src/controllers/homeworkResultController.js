const HomeworkResult = require("../models/HomeworkResult");
const Homework = require("../models/Homework");
const Student = require("../models/Student");
const { sendAlertEmail } = require("../utils/emailService");
const { sameSchool } = require("../utils/tenant");
const { notifyParent } = require("../utils/notify");

// Every teacher-facing grading screen (attendance, monthly grades, weekly
// evaluation) lets a teacher reopen and re-save — homework grading matches
// that now too, so no "already graded" guard here: the upsert below just
// overwrites each student's existing result with whatever's submitted.
exports.gradeBulkHomework = async (req, res) => {
  try {
    const { homeworkId } = req.params;
    const { grades } = req.body;

    const homework = await Homework.findById(homeworkId).populate(
      "subject",
      "name",
    );
    if (!homework)
      return res.status(404).json({ message: "الواجب غير موجود" });

    if (homework.teacher.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بتصحيح هذا الواجب" });
    }

    const bulkOps = grades.map((record) => ({
      updateOne: {
        filter: { homework: homeworkId, student: record.studentId },
        update: {
          $set: {
            status: record.status,
            score: record.status === "missing" ? 0 : record.score,
            teacherFeedback: record.teacherFeedback,
            gradedBy: req.user.id,
            school: req.user.school,
          },
        },
        upsert: true,
      },
    }));

    await HomeworkResult.bulkWrite(bulkOps);

    const gradedIds = grades.map((g) => g.studentId);
    const gradedStudents = await Student.find({
      _id: { $in: gradedIds },
    }).populate("parent", "email pushToken");
    const studentById = new Map(
      gradedStudents.map((s) => [s._id.toString(), s]),
    );

    // Best-effort — never blocks the grade save if a notification fails.
    await Promise.all(
      grades.map(async (record) => {
        const student = studentById.get(record.studentId.toString());
        if (!student?.parent) return;

        if (record.status === "missing") {
          if (student.parent.email) {
            try {
              await sendAlertEmail(
                student.parent.email,
                "تنبيه: عدم تسليم واجب مدرسي",
                `عزيزي ولي الأمر، نود إبلاغكم بأن الطالب ${student.firstName} لم يسلّم الواجب (${homework.title}) في مادة ${homework.subject.name}. برجاء المتابعة.`,
              );
            } catch (e) {
              console.log("Error sending assignment email:", e.message);
            }
          }
        }

        const scoreText =
          record.status === "missing"
            ? "لم يُسلَّم"
            : `${record.score}/${homework.totalMarks}`;

        await notifyParent({
          parentId: student.parent._id,
          pushToken: student.parent.pushToken,
          studentId: student._id,
          type: "homeworkGrade",
          title: "تم تصحيح الواجب",
          message: `${student.firstName}: ${scoreText} في واجب "${homework.title}" (${homework.subject.name}).`,
          school: req.user.school,
          createdBy: req.user.id,
        });
      }),
    );

    res.status(200).json({
      success: true,
      message: `تم حفظ الدرجات بنجاح لـ ${grades.length} طالب.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Prefill support: the grades this teacher already saved for this homework,
// so reopening the grading screen shows what's there instead of a blank
// sheet — mirrors the same pattern as monthly-grades/weekly-evaluation.
exports.getHomeworkResults = async (req, res) => {
  try {
    const { homeworkId } = req.params;

    const homework = await Homework.findById(homeworkId);
    if (!homework)
      return res.status(404).json({ message: "الواجب غير موجود" });

    if (homework.teacher.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بعرض درجات هذا الواجب" });
    }

    const results = await HomeworkResult.find({ homework: homeworkId });

    res.status(200).json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getParentHomeworkDashboard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);

    if (!student || !sameSchool(req, student)) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    // A parent could otherwise pass any studentId and read a stranger's
    // child's homework grades — this must mirror the same ownership check
    // every sibling student-scoped endpoint (attendance/behavior/exams)
    // already enforces.
    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message: "غير مصرح لك بعرض واجبات هذا الطالب.",
      });
    }

    const allHomeworks = await Homework.find({ classroom: student.classroom })
      .populate("subject", "name")
      .populate("teacher", "firstName lastName")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      });
    const studentResults = await HomeworkResult.find({
      student: studentId,
    }).populate("homework", "title totalMarks");

    const resultsMap = {};
    studentResults.forEach((res) => {
      resultsMap[res.homework._id.toString()] = res;
    });

    const pendingHomeworks = [];
    const gradedHomeworks = [];

    const now = new Date();

    allHomeworks.forEach((hw) => {
      const result = resultsMap[hw._id.toString()];

      if (result) {
        gradedHomeworks.push({
          homeworkDetails: hw,
          result: result,
        });
      } else {
        if (hw.dueDate >= now) {
          pendingHomeworks.push(hw);
        } else {
        }
      }
    });

    res.status(200).json({
      success: true,
      data: {
        activeAssignments: pendingHomeworks,
        historyAndResults: gradedHomeworks,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSingleGrade = async (req, res) => {
  try {
    const resultId = req.params.id;
    const { status, score, teacherFeedback } = req.body;

    const result = await HomeworkResult.findById(resultId).populate("homework");
    if (!result)
      return res.status(404).json({ message: "سجل الدرجة غير موجود" });

    if (
      result.homework.teacher.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بتعديل هذه الدرجة" });
    }

    result.status = status || result.status;
    result.score =
      status === "missing" ? 0 : score !== undefined ? score : result.score;
    result.teacherFeedback =
      teacherFeedback !== undefined ? teacherFeedback : result.teacherFeedback;
    result.gradedBy = req.user.id;

    await result.save();

    res.status(200).json({
      success: true,
      message: "تم تحديث درجة الطالب بنجاح",
      data: result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSingleGrade = async (req, res) => {
  try {
    const resultId = req.params.id;

    const result = await HomeworkResult.findById(resultId).populate("homework");
    if (!result)
      return res.status(404).json({ message: "سجل الدرجة غير موجود" });

    if (
      result.homework.teacher.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بحذف هذه الدرجة" });
    }

    await result.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "تم حذف سجل الدرجة بنجاح، والواجب أصبح معلّقًا لهذا الطالب مرة أخرى",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
