const School = require("../models/School");
const User = require("../models/User");
const Student = require("../models/Student");
const {
  generateUsername,
  generatePassword,
} = require("../utils/generateCredentials");
const { sendCredentialsEmail } = require("../utils/emailService");
const { friendlyDuplicateKeyMessage } = require("../utils/formatDbError");

// Everything here is platform-super-admin only (see schoolRoutes.js) — this
// is the onboarding surface for adding a new school to EduLink, whether
// they bought the system outright or are on a subscription.
exports.createSchool = async (req, res) => {
  try {
    const { name, code, plan } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "School name and code are required.",
      });
    }

    const school = await School.create({
      name,
      code: code.trim().toUpperCase(),
      plan: plan === "owned" ? "owned" : "subscription",
    });

    res.status(201).json({
      success: true,
      message: "School created successfully.",
      data: school,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A school with this code already exists.",
      });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAllSchools = async (req, res) => {
  try {
    const schools = await School.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: schools.length,
      data: schools,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The platform owner's actual landing page — everything a school's own
// admin sees (students/teachers/fees/...) is scoped to their one school by
// design, so it can never answer "how is the whole platform doing" or
// "which school just joined". This is the one endpoint that looks across
// every school at once.
exports.getPlatformOverview = async (req, res) => {
  try {
    const [schools, studentsPerSchool, staffPerSchool, totalStudents, totalTeachers, totalParents, totalAdmins] =
      await Promise.all([
        School.find().sort({ createdAt: -1 }),
        Student.aggregate([{ $group: { _id: "$school", count: { $sum: 1 } } }]),
        User.aggregate([
          { $match: { role: { $in: ["teacher", "parent"] } } },
          { $group: { _id: { school: "$school", role: "$role" }, count: { $sum: 1 } } },
        ]),
        Student.countDocuments(),
        User.countDocuments({ role: "teacher" }),
        User.countDocuments({ role: "parent" }),
        User.countDocuments({ role: "admin", isSuperAdmin: { $ne: true } }),
      ]);

    const studentCountBySchool = {};
    studentsPerSchool.forEach((row) => {
      studentCountBySchool[row._id?.toString()] = row.count;
    });

    const teacherCountBySchool = {};
    staffPerSchool.forEach((row) => {
      if (row._id.role === "teacher") {
        teacherCountBySchool[row._id.school?.toString()] = row.count;
      }
    });

    const schoolsWithCounts = schools.map((school) => ({
      _id: school._id,
      name: school.name,
      code: school.code,
      plan: school.plan,
      active: school.active,
      createdAt: school.createdAt,
      studentsCount: studentCountBySchool[school._id.toString()] || 0,
      teachersCount: teacherCountBySchool[school._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      totals: {
        schools: schools.length,
        students: totalStudents,
        teachers: totalTeachers,
        parents: totalParents,
        admins: totalAdmins,
      },
      schools: schoolsWithCounts,
      recentSchools: schoolsWithCounts.slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSchool = async (req, res) => {
  try {
    const { name, plan, active, features } = req.body;

    const update = { name, plan, active };
    // Sent as the complete features object each time (see SchoolManager's
    // edit form), so a direct replace is correct here — no need to merge
    // individual keys.
    if (features) update.features = features;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({ success: false, message: "School not found" });
    }

    res.status(200).json({
      success: true,
      message: "School updated successfully.",
      data: school,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Creates the very first admin account for a school — the entry point a
// new school actually starts using EduLink from. Every later admin for
// that school is created by this first admin via the normal
// POST /admin/sub-admin route.
exports.createSchoolAdmin = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { firstName, lastName, nationalId, phoneNumber, email } = req.body;

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: "School not found" });
    }

    const username = generateUsername(phoneNumber);
    const password = generatePassword();

    const admin = await User.create({
      firstName,
      lastName,
      nationalId,
      phoneNumber,
      email,
      role: "admin",
      school: school._id,
      isPrimaryAdmin: true,
      username,
      password,
      active: true,
    });

    if (email) {
      await sendCredentialsEmail(email, username, password, "Admin");
    }

    res.status(201).json({
      success: true,
      message: `Admin account created for ${school.name}.`,
      admin: { id: admin._id, username: admin.username },
    });
  } catch (err) {
    res
      .status(400)
      .json({
        success: false,
        message: friendlyDuplicateKeyMessage(err) || err.message,
      });
  }
};

// Deleting a school is only ever safe while it's still empty — once it has
// real students/staff enrolled, removing the School document would orphan
// every one of their records (same class of bug fixed today in
// gradeController). A school with real data gets deactivated instead
// (PUT /:id with active:false), never hard-deleted.
exports.deleteSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: "School not found" });
    }

    const [studentsCount, usersCount] = await Promise.all([
      Student.countDocuments({ school: school._id }),
      User.countDocuments({ school: school._id }),
    ]);

    if (studentsCount > 0 || usersCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "cannot delete this school because it already has students and/or staff accounts. Deactivate it instead if it should stop being used.",
      });
    }

    await school.deleteOne();
    res.status(200).json({ success: true, message: "School deleted successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
