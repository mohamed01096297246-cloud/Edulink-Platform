const Grade = require("../models/Grade");
const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Exam = require("../models/Exam");
const User = require("../models/User");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createGrade = async (req, res) => {
  try {
    const { name, academicYear } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a grade for.",
      });
    }

    const grade = await Grade.create({ name, academicYear, school });

    res.status(201).json({
      success: true,
      message: "Grade created successfully",
      data: grade,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        message: "This grade already exists for this academic year.",
      });
    }
    res.status(400).json({ message: err.message });
  }
};

exports.getAllGrades = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its grades.",
      });
    }

    const grades = await Grade.find(filter);
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateGrade = async (req, res) => {
  try {
    const existing = await Grade.findById(req.params.id);

    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Grade not found" });
    }

    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Grade updated successfully",
      data: grade,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const existing = await Grade.findById(req.params.id);

    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Grade not found" });
    }

    // Classroom/Student/Subject/Exam all point at a grade by id, and
    // teachers carry it in teachingGrades — deleting the grade out from
    // under any of them would leave a dangling reference (populate("grade")
    // would just silently come back null wherever it's used). Mirror the
    // same dependency checks classroomController/subjectController/
    // teacherController already enforce before their own deletes.
    const [classroomsCount, studentsCount, subjectsCount, examsCount, teachersCount] =
      await Promise.all([
        Classroom.countDocuments({ grade: existing._id }),
        Student.countDocuments({ grade: existing._id }),
        Subject.countDocuments({ grade: existing._id }),
        Exam.countDocuments({ grade: existing._id }),
        User.countDocuments({ role: "teacher", teachingGrades: existing._id }),
      ]);

    if (classroomsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has classrooms assigned to it. Please delete or reassign those classrooms first.",
      });
    }
    if (studentsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has students enrolled in it.",
      });
    }
    if (subjectsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has subjects assigned to it. Please delete or reassign those subjects first.",
      });
    }
    if (examsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has exams scheduled for it.",
      });
    }
    if (teachersCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because there are teachers assigned to teach it.",
      });
    }

    await existing.deleteOne();
    res
      .status(200)
      .json({ success: true, message: "Grade deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
