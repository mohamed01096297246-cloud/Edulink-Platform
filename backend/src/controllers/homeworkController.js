const Homework = require("../models/Homework");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const Student = require("../models/Student");

exports.createHomework = async (req, res) => {
  try {
    const { title, pageNumber, totalMarks, dueDate, grade } = req.body;
    const teacher = await User.findById(req.user.id);
    const isAuthorized = teacher.teachingGrades.some(
      (gId) => gId.toString() === grade.toString(),
    );

    if (!isAuthorized) {
      return res
        .status(403)
        .json({
          message: "You are not authorized to create homework for this grade.",
        });
    }

    const classrooms = await Classroom.find({ grade: grade });
    if (classrooms.length === 0) {
      return res
        .status(404)
        .json({
          message: "No classrooms registered for this grade at the moment.",
        });
    }

    const homeworkEntries = classrooms.map((cls) => ({
      title,
      pageNumber,
      totalMarks,
      dueDate,
      classroom: cls._id,
      teacher: req.user.id,
      subject: teacher.subject,
    }));

    await Homework.insertMany(homeworkEntries);

    res.status(201).json({
      success: true,
      message: `Homework created successfully for ${classrooms.length} classrooms in grade ${grade}`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
exports.getAllHomeworks = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "teacher") {
      filter.teacher = req.user.id;
    }

    if (req.query.gradeId) {
      const classrooms = await Classroom.find({
        grade: req.query.gradeId,
      }).select("_id");
      const classroomIds = classrooms.map((c) => c._id);
      filter.classroom = { $in: classroomIds };
    }

    const homeworks = await Homework.find(filter)
      .populate("classroom", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: homeworks,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentHomeworks = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({
          message: "You are not authorized to view this student's homework",
        });
    }
    const homeworks = await Homework.find({ classroom: student.classroom })
      .populate("subject", "name")
      .populate("teacher", "firstName lastName")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: homeworks.length,
      data: homeworks,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateHomework = async (req, res) => {
  try {
    const homeworkId = req.params.id;
    const homework = await Homework.findById(homeworkId);

    if (!homework) {
      return res.status(404).json({ message: "homework not found" });
    }

    if (homework.teacher.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this homework" });
    }

    const updatedHomework = await Homework.findByIdAndUpdate(
      homeworkId,
      req.body,
      { new: true, runValidators: true },
    )
      .populate("subject", "name")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      });

    res.status(200).json({
      success: true,
      message: "homework updated successfully",
      data: updatedHomework,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteHomework = async (req, res) => {
  try {
    const homeworkId = req.params.id;
    const homework = await Homework.findById(homeworkId);

    if (!homework) {
      return res.status(404).json({ message: "homework not found" });
    }

    if (
      homework.teacher.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this homework" });
    }

    await homework.deleteOne();

    res.status(200).json({
      success: true,
      message: "homework deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
