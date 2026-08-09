const User = require("../models/User");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const Schedule = require("../models/Schedule");
const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const Student = require("../models/Student");
const { sendCredentialsEmail } = require("../utils/emailService");
const {
  generateUsername,
  generatePassword,
} = require("../utils/generateCredentials");

exports.createTeacher = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      subjectId,
      teachingGrades,
    } = req.body;

    const existingSubject = await Subject.findById(subjectId);
    if (!existingSubject) {
      return res
        .status(400)
        .json({ message: "sorry, the selected subject does not exist" });
    }
    const username = generateUsername(`${firstName} ${lastName}`);
    const password = generatePassword();
    const teacher = await User.create({
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      role: "teacher",
      subject: subjectId,
      teachingGrades,
      username,
      password,
      active: true,
    });

    if (email) await sendCredentialsEmail(email, username, password, "Teacher");

    res.status(201).json({
      message: "Teacher created successfully",
      teacher: {
        id: teacher._id,
        name: `${teacher.firstName} ${teacher.lastName}`,
        username: teacher.username,
        teachingGrades: teacher.teachingGrades,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher" })
      .populate("subject", "name code")
      .populate("teachingGrades", "name academicYear")
      .select(
        "firstName lastName phoneNumber email nationalId teachingGrades subject",
      );

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "error during data retrieval: " + err.message,
    });
  }
};
exports.getTeacherDashboard = async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "sorry, this dashboard is for teachers only" });
    }

    const teacherId = req.user.id;
    const { classroomId } = req.query;

    const allSchedules = await Schedule.find({ teacher: teacherId })
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name" },
      })
      .populate("subject", "name")
      .sort({ day: 1, startTime: 1 });

    let currentClassStudents = [];
    if (classroomId) {
      currentClassStudents = await Student.find({
        classroom: classroomId,
        active: true,
      }).select("firstName lastName gender phoneNumber");
    }

    const now = new Date();
    const days = ["sun", "mon", "tue", "wed", "thu"];
    const today = days[now.getDay()];
    const todayClassesCount = allSchedules.filter(
      (s) => s.day === today,
    ).length;

    res.json({
      allSchedules,
      currentClassStudents,
      summary: {
        totalClassesToday: todayClassesCount,
        serverTime: new Date().toLocaleTimeString("ar-EG", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      subjectId,
      teachingGrades,
      active,
    } = req.body;

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "sorry, the requested teacher was not found." });
    }

    const updateData = { firstName, lastName, phoneNumber, nationalId, email };

    if (active !== undefined) updateData.active = active;

    if (subjectId) {
      const Subject = require("../models/Subject");
      const existingSubject = await Subject.findById(subjectId);
      if (!existingSubject) {
        return res
          .status(400)
          .json({ message: "sorry, the selected subject does not exist" });
      }
      updateData.subject = subjectId;
    }

    if (teachingGrades) {
      updateData.teachingGrades = teachingGrades;
    }

    const updatedTeacher = await User.findByIdAndUpdate(teacherId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("subject", "name code")
      .populate("teachingGrades", "name academicYear")
      .select("-password");

    res.status(200).json({
      success: true,
      message: "Teacher updated successfully",
      data: updatedTeacher,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const MASTER_EMAIL = "admin_master";
    if (req.user && req.user.username !== MASTER_EMAIL) {
      return res.status(403).json({
        success: false,
        message:
          "sorry, your account does not have permission to delete teachers. Please contact the Master Admin.",
      });
    }

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
    if (!teacher) {
      return res
        .status(404)
        .json({ message: "sorry, the requested teacher was not found." });
    }

    const Schedule = require("../models/Schedule");
    const schedulesCount = await Schedule.countDocuments({
      teacher: teacherId,
    });

    if (schedulesCount > 0) {
      return res.status(400).json({
        message:
          "sorry, this teacher cannot be deleted as they are associated with study schedules. Please delete their schedules first.",
      });
    }

    await teacher.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "sorry, the teacher's account has been successfully deleted by the Master Admin",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
