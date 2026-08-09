const mongoose = require("mongoose");
const Result = require("../models/Result");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const Exam = require("../models/Exam");

exports.getTeacherGrades = async (req, res) => {
  try {
    const teacherSchedules = await Schedule.find({ teacher: req.user.id })
      .populate("classroom")
      .populate({
        path: "classroom",
        populate: { path: "grade" },
      });

    const gradesMap = new Map();
    teacherSchedules.forEach((sch) => {
      if (sch.classroom && sch.classroom.grade) {
        const grade = sch.classroom.grade;
        gradesMap.set(grade._id.toString(), grade);
      }
    });

    return res.status(200).json({
      success: true,
      data: Array.from(gradesMap.values()),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamsAndClassroomsByGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;

    if (!gradeId) {
      return res
        .status(400)
        .json({ success: false, message: "Grade ID is required." });
    }

    const schedules = await Schedule.find({ teacher: req.user.id }).populate({
      path: "classroom",
      match: { grade: new mongoose.Types.ObjectId(gradeId) },
    });

    const classroomsMap = new Map();
    const subjectsSet = new Set();

    schedules.forEach((sch) => {
      if (sch.classroom) {
        classroomsMap.set(sch.classroom._id.toString(), sch.classroom);
      }
      if (sch.subject) {
        subjectsSet.add(sch.subject.toString());
      }
    });

    const exams = await Exam.find({
      grade: new mongoose.Types.ObjectId(gradeId),
      "timetable.subject": { $in: Array.from(subjectsSet) },
    }).populate("timetable.subject", "name");

    return res.status(200).json({
      success: true,
      classrooms: Array.from(classroomsMap.values()),
      exams: exams,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getClassroomStudentsForMarks = async (req, res) => {
  try {
    const { classroomId } = req.params;

    const students = await Student.find({ classroom: classroomId })
      .select("firstName lastName")
      .sort({ firstName: 1 });

    return res.status(200).json({
      success: true,
      data: students,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.addGrade = async (req, res) => {
  try {
    const { studentId, examId, subjectId, grade } = req.body;

    const result = await Result.findOneAndUpdate(
      { student: studentId, exam: examId, subject: subjectId },
      { grade, teacher: req.user.id },
      { upsert: true, new: true },
    );

    res
      .status(200)
      .json({ success: true, message: "Grade recorded successfully", result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getReportCard = async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const student = await Student.findById(studentId)
      .populate("parent", "firstName lastName")
      .populate("grade", "name academicYear")
      .populate("classroom", "name");
    const grades = await Result.find({ student: studentId, exam: examId })
      .populate("subject", "name")
      .populate("exam", "title academicYear");

    if (grades.length === 0)
      return res.status(404).json({ message: "No grades recorded yet" });

    let totalStudentMarks = 0;
    let totalMaxMarks = grades.length * 100;

    grades.forEach((g) => {
      totalStudentMarks += g.grade;
    });

    res.status(200).json({
      success: true,
      data: {
        reportTitle: `Results of ${student.firstName}'s Exams`,
        academicYear: grades[0].exam?.academicYear || "",
        examName: grades[0].exam?.title || "Unknown Exam",
        subjects: grades,
        summary: {
          studentTotal: totalStudentMarks,
          maxTotal: totalMaxMarks,
          percentage:
            ((totalStudentMarks / totalMaxMarks) * 100).toFixed(2) + "%",
        },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.addBulkGrades = async (req, res) => {
  try {
    const { examId, subjectId, gradesList } = req.body;

    if (!gradesList || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "You must submit a list of grades" });
    }
    const studentIds = gradesList.map((r) => r.studentId);
    const existingResults = await Result.find({
      exam: examId,
      subject: subjectId,
      student: { $in: studentIds },
    });
    const isAlreadyRecorded = existingResults.length > 0;
    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: { student: record.studentId, exam: examId, subject: subjectId },
        update: {
          $set: {
            grade: record.grade,
            teacher: req.user.id,
          },
        },
        upsert: true,
      },
    }));
    await Result.bulkWrite(bulkOps);
    if (isAlreadyRecorded) {
      return res.status(200).json({
        success: true,
        isUpdate: true,
        message: " Grades updated successfully! 📝",
      });
    } else {
      return res.status(200).json({
        success: true,
        isUpdate: false,
        message: " Grades saved successfully! 🚀",
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
exports.updateGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const { grade } = req.body;

    if (grade < 0 || grade > 100) {
      return res
        .status(400)
        .json({ message: "Grade must be between 0 and 100" });
    }

    const updatedResult = await Result.findByIdAndUpdate(
      id,
      {
        grade,
        updatedBy: req.user.id,
      },
      { new: true, runValidators: true },
    )
      .populate({
        path: "student",
        select: "firstName lastName",
        populate: [
          { path: "grade", select: "name academicYear" },
          { path: "classroom", select: "name" },
        ],
      })
      .populate("subject", "name")
      .populate("exam", "title academicYear");

    if (!updatedResult) {
      return res.status(404).json({ message: "Grade record not found" });
    }

    res.status(200).json({
      success: true,
      message: "Grade updated successfully by administration",
      data: updatedResult,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findByIdAndDelete(id);

    if (!result)
      return res.status(404).json({ message: "Grade record not found" });

    res
      .status(200)
      .json({ success: true, message: "Grade record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
