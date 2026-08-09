const Exam = require("../models/Exam");
const Student = require("../models/Student");
const User = require("../models/User");
exports.createExamSchedule = async (req, res) => {
  try {
    const { title, examType, academicYear, grade, timetable } = req.body;
    const exam = await Exam.create({
      title,
      examType,
      academicYear,
      grade,
      timetable,
    });
    res.status(201).json({
      success: true,
      message: "Exam schedule created successfully",
      data: exam,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find()
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: exams.length, data: exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getTeacherExams = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id).populate("classrooms");

    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const gradeIds = [...new Set(teacher.classrooms.map((c) => c.grade))];
    const exams = await Exam.find({
      grade: { $in: gradeIds },
    })
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name");
    res.status(200).json({
      success: true,
      count: exams.length,
      data: exams,
    });
  } catch (err) {
    console.error("Error in getTeacherExams:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.getStudentExams = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message: "You are not authorized to view this student's exams",
      });
    }

    const exams = await Exam.find({ grade: student.grade })
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.updateExamSchedule = async (req, res) => {
  try {
    const examId = req.params.id;

    const updatedExam = await Exam.findByIdAndUpdate(examId, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("grade", "name academicYear")
      .populate("timetable.subject", "name");

    if (!updatedExam) {
      return res.status(404).json({ message: "Exam schedule not found" });
    }

    res.status(200).json({
      success: true,
      message: "Exam schedule updated successfully",
      data: updatedExam,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
exports.deleteExamSchedule = async (req, res) => {
  try {
    const examId = req.params.id;

    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam schedule not found" });
    }

    await exam.deleteOne();

    res.status(200).json({
      success: true,
      message: "Exam schedule deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
