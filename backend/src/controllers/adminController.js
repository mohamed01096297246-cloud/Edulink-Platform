const bcrypt = require("bcrypt");
const User = require("../models/User");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const Attendance = require("../models/Attendance");
const Notification = require("../models/Notification");
const Subject = require("../models/Subject");
const { sendCredentialsEmail } = require("../utils/emailService");
const {
  generateUsername,
  generatePassword,
} = require("../utils/generateCredentials");

const mongoose = require("mongoose");

exports.protectAdminActions = async (req, res, next) => {
  try {
    const currentUser = req.user;
    const targetUserId = req.params.id;
    if (currentUser.username !== "admin_master") {
      if (
        req.route.path === "/sub-admin" ||
        (req.body && req.body.role === "admin")
      ) {
        return res.status(403).json({
          success: false,
          message:
            "sorry, you do not have permission to create or modify admin accounts.",
        });
      }
      if (targetUserId) {
        const targetUser = await User.findById(targetUserId);
        if (targetUser && targetUser.role === "admin") {
          return res.status(403).json({
            success: false,
            message:
              "sorry, you do not have permission to modify or delete another admin's account.",
          });
        }
      }
    }
    next();
  } catch (err) {
    res.status(500).json({
      message:
        "sorry, an error occurred while checking permissions: " + err.message,
    });
  }
};

exports.createSubAdmin = async (req, res) => {
  try {
    const { firstName, lastName, nationalId, phoneNumber, email } = req.body;

    const username = generateUsername(`${firstName} ${lastName}`);
    const password = generatePassword();

    const newAdmin = await User.create({
      firstName,
      lastName,
      nationalId,
      username,
      password,
      phoneNumber,
      email,
      role: "admin",
      active: true,
    });
    if (email) {
      const { sendCredentialsEmail } = require("../utils/emailService");
      await sendCredentialsEmail(email, username, password, "Admin");
    }
    res.status(201).json({
      message: "new admin added successfully",
      admin: newAdmin.username,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAdminDashboard = async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const totalTeachers = await User.countDocuments({ role: "teacher" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendanceToday = await Attendance.find({ date: { $gte: today } });
    const present = attendanceToday.filter(
      (a) => a.status === "present",
    ).length;
    const absent = attendanceToday.filter((a) => a.status === "absent").length;

    res.json({
      stats: { totalStudents, totalTeachers, present, absent },
      latestNotifications: await Notification.find()
        .sort({ createdAt: -1 })
        .limit(5),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const ADMIN_MASTER = "admin_master";
    if (currentUser.username !== "admin_master") {
      return res.status(403).json({
        message:
          "sorry, you do not have permission to delete another admin's account.",
      });
    }
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "user not found" });
    if (user.username === "admin_master") {
      return res
        .status(403)
        .json({ message: "sorry, you cannot delete the master admin account" });
    }
    if (user.role === "parent") {
      await Student.deleteMany({ parent: id });
    }
    if (user.role === "teacher") {
      await Schedule.deleteMany({ teacher: id });
    }
    await User.findByIdAndDelete(id);
    res.json({ message: `${user.role} deleted  successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.protectAdminActions = async (req, res, next) => {
  try {
    const SUPER_ADMIN_ID =
      process.env.SUPER_ADMIN_ID || "69e6af0d5a64b6fff6d7e5d8";
    const currentUserId = req.user.id;
    const targetUserId = req.params.id;

    if (currentUserId === targetUserId && req.method !== "DELETE") {
      return next();
    }

    if (currentUserId !== SUPER_ADMIN_ID) {
      if (targetUserId) {
        const targetUser = await User.findById(targetUserId);
        if (targetUser && targetUser.role === "admin") {
          return res.status(403).json({
            success: false,
            message:
              "sorry, you do not have permission to modify or delete another admin's account.",
          });
        }
      }
      if (req.body && req.body.role === "admin") {
        return res.status(403).json({
          success: false,
          message:
            "sorry, you do not have permission to create new admin accounts.",
        });
      }
    }
    next();
  } catch (err) {
    res.status(500).json({
      message: " an error occurred while checking permissions: " + err.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const ADMIN_MASTER_USERNAME = "admin_master";
    if (req.user && req.user.username !== ADMIN_MASTER_USERNAME) {
      const targetUser = await User.findById(userId);
      if (targetUser && targetUser.role === "admin") {
        return res.status(403).json({
          success: false,
          message:
            "sorry, you do not have permission to modify another admin's account.",
        });
      }
    }
    const updates = req.body;

    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    ).select("-password");

    if (!updatedUser)
      return res.status(404).json({ message: "user not found" });

    res.json({ message: "data updated successfully", user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const query = req.query.role ? { role: req.query.role } : {};

    const users = await User.find(query)
      .populate("subject", "name")
      .populate("teachingGrades", "name academicYear")
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    res.status(500).json({
      error: " an error occurred while fetching data: " + err.message,
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "invalid user ID" });
    }

    const user = await User.findById(id)
      .populate("subject", "name")
      .populate("teachingGrades", "name academicYear")
      .select("-password");

    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
