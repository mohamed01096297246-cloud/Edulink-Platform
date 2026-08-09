const HomeworkResult = require("../models/HomeworkResult");
const Homework = require("../models/Homework");
const Student = require("../models/Student");
const { sendAlertEmail } = require("../utils/emailService");

exports.gradeBulkHomework = async (req, res) => {
  try {
    const { homeworkId } = req.params;
    const { grades } = req.body;

    const homework = await Homework.findById(homeworkId).populate(
      "subject",
      "name",
    );
    if (!homework)
      return res.status(404).json({ message: "Homework not found" });

    if (homework.teacher.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to grade this homework" });
    }

    const studentIds = grades.map((g) => g.studentId);

    const existingResults = await HomeworkResult.findOne({
      homework: homeworkId,
      student: { $in: studentIds },
    });

    if (existingResults) {
      return res.status(400).json({
        success: false,
        message: "Grades for this homework have already been recorded.",
      });
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
          },
        },
        upsert: true,
      },
    }));

    await HomeworkResult.bulkWrite(bulkOps);

    const missingStudents = grades.filter((g) => g.status === "missing");

    if (missingStudents.length > 0) {
      const missingIds = missingStudents.map((g) => g.studentId);
      const studentsToNotify = await Student.find({
        _id: { $in: missingIds },
      }).populate("parent");
      await Promise.all(
        studentsToNotify.map(async (studentData) => {
          if (studentData.parent && studentData.parent.email) {
            try {
              await sendAlertEmail(
                studentData.parent.email,
                "Warning: Academic Negligence: Non-Submission of Assignment",
                `Dear Parent, we would like to inform you that the student ${studentData.firstName} has not submitted the assignment (${homework.title}) in the subject ${homework.subject.name}. Please follow up.`,
              );
            } catch (e) {
              console.log("Error sending assignment email:", e.message);
            }
          }
        }),
      );
    }

    res.status(200).json({
      success: true,
      message: `Grades recorded successfully for ${grades.length} students.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getParentHomeworkDashboard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);

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
      return res.status(404).json({ message: "Grade record not found" });

    if (
      result.homework.teacher.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "You are not authorized to modify this grade" });
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
      message: "Student grade updated successfully",
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
      return res.status(404).json({ message: "Grade record not found" });

    if (
      result.homework.teacher.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this grade" });
    }

    await result.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "Grade record deleted successfully, the assignment is now pending for this student",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
