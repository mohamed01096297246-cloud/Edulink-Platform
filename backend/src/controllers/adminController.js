const bcrypt = require("bcrypt");
const User = require("../models/User");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const Attendance = require("../models/Attendance");
const StaffAttendance = require("../models/StaffAttendance");
const Notification = require("../models/Notification");
const { sendCredentialsEmail } = require("../utils/emailService");
const {
  generateUsername,
  generatePassword,
} = require("../utils/generateCredentials");

const mongoose = require("mongoose");
const { scopeFilter, sameSchool } = require("../utils/tenant");
const { friendlyDuplicateKeyMessage } = require("../utils/formatDbError");

// Guards admin-account actions: creating another admin, or modifying/
// deleting an existing one. Allowed for the platform super-admin (across
// every school) and for a school's own primary admin (within their own
// school only) — an ordinary sub-admin can manage teachers/parents/
// students, but never other admin accounts.
exports.protectAdminActions = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    if (req.user.isSuperAdmin || req.user.isPrimaryAdmin) {
      return next();
    }

    if (req.body && req.body.role === "admin") {
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

    next();
  } catch (err) {
    res.status(500).json({
      message:
        "sorry, an error occurred while checking permissions: " + err.message,
    });
  }
};

// Creates a sub-admin for the caller's own school. Only the platform
// super-admin can create admins directly for a different school — see
// schoolController.createSchoolAdmin for onboarding a brand-new school.
exports.createSubAdmin = async (req, res) => {
  try {
    const { firstName, lastName, nationalId, phoneNumber, email } = req.body;

    if (!req.user.school) {
      return res.status(400).json({
        message:
          "sorry, your account has no school context — this action isn't available to the platform super-admin here.",
      });
    }

    const username = generateUsername(phoneNumber);
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
      school: req.user.school,
      active: true,
    });
    if (email) {
      await sendCredentialsEmail(email, username, password, "Admin");
    }
    res.status(201).json({
      message: "new admin added successfully",
      admin: newAdmin.username,
    });
  } catch (err) {
    res
      .status(400)
      .json({ error: friendlyDuplicateKeyMessage(err) || err.message });
  }
};

exports.getAdminDashboard = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) for this dashboard.",
      });
    }

    const totalStudents = await Student.countDocuments(filter);
    const totalTeachers = await User.countDocuments({
      ...filter,
      role: "teacher",
    });

    // Matches the UTC-midnight convention every attendance record is
    // stored with (see attendanceController.js) — comparing against local
    // server midnight here would silently misclassify "today" whenever the
    // server isn't running in UTC.
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const attendanceToday = await Attendance.find({
      ...filter,
      date: { $gte: todayUTC },
    });
    const studentsPresent = attendanceToday.filter(
      (a) => a.status === "present",
    ).length;
    const studentsAbsent = attendanceToday.filter(
      (a) => a.status === "absent",
    ).length;

    const staffAttendanceToday = await StaffAttendance.find({
      ...filter,
      date: { $gte: todayUTC },
    });
    const teachersPresent = staffAttendanceToday.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const teachersAbsent = staffAttendanceToday.filter(
      (a) => a.status === "absent",
    ).length;

    res.json({
      stats: {
        totalStudents,
        studentsPresent,
        studentsAbsent,
        totalTeachers,
        teachersPresent,
        teachersAbsent,
        // kept for any other consumer still reading the old flat shape
        present: studentsPresent,
        absent: studentsAbsent,
      },
      // Admins care about school announcements here, not the per-parent
      // notices a teacher's grading/behavior/homework actions generate —
      // those belong to the parent's own feed and would otherwise bury
      // every real announcement. $nin (rather than type: "broadcast")
      // keeps pre-`type` legacy announcements visible too.
      latestNotifications: await Notification.find({
        ...filter,
        type: { $nin: ["homework", "homeworkGrade", "behavior", "boardNote"] },
      })
        .sort({ createdAt: -1 })
        .limit(5),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "user not found" });

    if (!sameSchool(req, user)) {
      return res.status(404).json({ message: "user not found" });
    }

    if (user.isSuperAdmin) {
      return res
        .status(403)
        .json({ message: "sorry, you cannot delete the super admin account" });
    }

    if (
      user.role === "admin" &&
      !req.user.isSuperAdmin &&
      !req.user.isPrimaryAdmin
    ) {
      return res.status(403).json({
        message:
          "sorry, you do not have permission to delete another admin's account.",
      });
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

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const targetUser = await User.findById(userId);
    if (!targetUser || !sameSchool(req, targetUser)) {
      return res.status(404).json({ message: "user not found" });
    }

    if (
      targetUser.role === "admin" &&
      !req.user.isSuperAdmin &&
      !req.user.isPrimaryAdmin
    ) {
      return res.status(403).json({
        success: false,
        message:
          "sorry, you do not have permission to modify another admin's account.",
      });
    }

    const updates = req.body;
    // `school`, `isSuperAdmin` and `isPrimaryAdmin` are never editable
    // through this endpoint — a user can't reassign themselves to another
    // tenant or grant themselves elevated privileges this way.
    delete updates.school;
    delete updates.isSuperAdmin;
    delete updates.isPrimaryAdmin;

    // Per-user app control (active + appFeatures) for teachers/parents is
    // the platform owner's tool only (SchoolManager's "المعلمين"/"أولياء
    // الأمور" panels) — a school's own admin has no UI for this anymore
    // and shouldn't be able to reach the same effect by calling this
    // shared endpoint directly.
    if (
      !req.user.isSuperAdmin &&
      (targetUser.role === "teacher" || targetUser.role === "parent")
    ) {
      delete updates.active;
      delete updates.appFeatures;
    }

    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true },
    ).select("-password");

    res.json({ message: "data updated successfully", user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const filter = scopeFilter(req, req.query.role ? { role: req.query.role } : {});

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its users.",
      });
    }

    const users = await User.find(filter)
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

    if (!user || !sameSchool(req, user)) {
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
