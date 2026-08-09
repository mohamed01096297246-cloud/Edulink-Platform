const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");

exports.createClassroom = async (req, res) => {
  try {
    const { name, grade, academicYear, capacity } = req.body;

    const existingClass = await Classroom.findOne({
      name,
      grade,
      academicYear,
    });

    if (existingClass) {
      return res.status(400).json({
        message: "Classroom already exists for this academic year",
      });
    }

    const classroom = await Classroom.create({
      name,
      grade,
      academicYear,
      capacity: capacity || 30,
    });

    res.status(201).json({
      message: "classroom created successfully",
      classroom,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        message: "Classroom already exists",
      });
    }
    res.status(400).json({ message: err.message });
  }
};

exports.getAllClassrooms = async (req, res) => {
  try {
    const data = await Classroom.find()
      .populate("grade", "name academicYear")
      .sort({
        academicYear: -1,
        grade: 1,
        name: 1,
      });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id).populate(
      "grade",
      "name academicYear",
    );

    if (!classroom) {
      return res.status(404).json({
        message: "Classroom not found",
      });
    }

    const students = await Student.find({
      classroom: classroom._id,
    }).select("firstName lastName");

    res.json({
      ...classroom.toObject(),
      students,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateClassroom = async (req, res) => {
  try {
    const { name, grade, academicYear, capacity } = req.body;

    const currentClassroom = await Classroom.findById(req.params.id);
    if (!currentClassroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (capacity && capacity < currentClassroom.currentStudents) {
      return res.status(400).json({
        message: `Logical Error: You cannot reduce the capacity of the classroom to (${capacity}) because it currently has (${currentClassroom.currentStudents}) students.`,
      });
    }

    const existingClass = await Classroom.findOne({
      name,
      grade,
      academicYear,
      _id: { $ne: req.params.id },
    });

    if (existingClass) {
      return res.status(400).json({
        message:
          "A classroom with the same name and grade already exists for this academic year.",
      });
    }

    const updatedClassroom = await Classroom.findByIdAndUpdate(
      req.params.id,
      { name, grade, academicYear, capacity },
      { new: true, runValidators: true },
    ).populate("grade", "name academicYear");

    res.json({
      message: "Classroom updated successfully",
      classroom: updatedClassroom,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);

    if (!classroom) {
      return res.status(404).json({
        message: "Classroom not found",
      });
    }

    const studentsCount = await Student.countDocuments({
      classroom: classroom._id,
    });

    if (studentsCount > 0) {
      return res.status(400).json({
        message:
          "you cannot delete this classroom because it has associated students.",
      });
    }

    const schedulesCount = await Schedule.countDocuments({
      classroom: classroom._id,
    });

    if (schedulesCount > 0) {
      return res.status(400).json({
        message:
          "you cannot delete this classroom because it is associated with existing schedules.",
      });
    }

    await classroom.deleteOne();

    res.json({
      message: "Classroom deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
