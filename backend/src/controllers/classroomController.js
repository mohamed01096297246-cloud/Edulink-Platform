const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createClassroom = async (req, res) => {
  try {
    const { name, grade, academicYear, capacity } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a classroom for.",
      });
    }

    const existingClass = await Classroom.findOne({
      name,
      grade,
      academicYear,
      school,
    });

    if (existingClass) {
      return res.status(400).json({
        message: "هذا الفصل موجود بالفعل لهذه المرحلة الدراسية ",
      });
    }

    const classroom = await Classroom.create({
      name,
      grade,
      academicYear,
      capacity: capacity || 30,
      school,
    });

    res.status(201).json({
      message: "تم إنشاء الفصل بنجاح",
      classroom,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        message: "الفصل موجود بالفعل",
      });
    }
    res.status(400).json({ message: err.message });
  }
};

exports.getAllClassrooms = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its classrooms.",
      });
    }

    const data = await Classroom.find(filter)
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

    if (!classroom || !sameSchool(req, classroom)) {
      return res.status(404).json({
        message: "لم يتم العثور علي هذا الفصل ",
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
    if (!currentClassroom || !sameSchool(req, currentClassroom)) {
      return res.status(404).json({ message: "لم يتم العثور علي هذا الفصل " });
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
      school: currentClassroom.school,
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
      message: "تم إنشاء الفصل بنجاح ",
      classroom: updatedClassroom,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);

    if (!classroom || !sameSchool(req, classroom)) {
      return res.status(404).json({
        message: "لم يتم العثور علي هذا الفصل ",
      });
    }

    const studentsCount = await Student.countDocuments({
      classroom: classroom._id,
    });

    if (studentsCount > 0) {
      return res.status(400).json({
        message:
          "لايمكن حذف هذا الفصل لوجود طلاب بالفعل ",
      });
    }

    const schedulesCount = await Schedule.countDocuments({
      classroom: classroom._id,
    });

    if (schedulesCount > 0) {
      return res.status(400).json({
        message:
           "لايمكن حذف هذا الفصل لوجود جداول دراسية مرتبطه به ",
      });
    }

    await classroom.deleteOne();

    res.json({
      message: "تم حذف الفصل بنجاح",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
