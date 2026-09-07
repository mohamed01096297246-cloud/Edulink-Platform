const User = require("../models/User");
const Subject = require("../models/Subject");
const Schedule = require("../models/Schedule");
const Student = require("../models/Student");
const { sendCredentialsEmail } = require("../utils/emailService");
const {
  generateUsername,
  generatePassword,
} = require("../utils/generateCredentials");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");
const { friendlyDuplicateKeyMessage } = require("../utils/formatDbError");
const { resolveTeacherSubject } = require("../utils/teacherSubject");

// A teacher may hold several subjects now. `subjectId` is still read so an
// admin build that hasn't been redeployed yet keeps working.
const readSubjectIds = (body) => {
  if (Array.isArray(body.subjectIds)) return body.subjectIds.filter(Boolean);
  if (Array.isArray(body.subjects)) return body.subjects.filter(Boolean);
  if (body.subjectId) return [body.subjectId];
  return [];
};

exports.createTeacher = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      teachingGrades,
    } = req.body;

    const school = creationSchool(req);
    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a teacher for.",
      });
    }

    const subjectIds = readSubjectIds(req.body);

    if (subjectIds.length === 0) {
      return res
        .status(400)
        .json({ message: "اختر مادة واحدة على الأقل لهذا المعلم." });
    }

    const found = await Subject.countDocuments({
      _id: { $in: subjectIds },
      school,
    });
    if (found !== subjectIds.length) {
      return res
        .status(400)
        .json({ message: "sorry, the selected subject does not exist" });
    }

    const username = generateUsername(phoneNumber);
    const password = generatePassword();
    const teacher = await User.create({
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      role: "teacher",
      subjects: subjectIds,
      teachingGrades,
      school,
      username,
      password,
      active: true,
    });

    if (email)
      await sendCredentialsEmail(
        email,
        username,
        password,
        "Teacher",
        `${teacher.firstName} ${teacher.lastName}`,
      );

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
    res
      .status(500)
      .json({ error: friendlyDuplicateKeyMessage(err) || err.message });
  }
};

exports.getAllTeachers = async (req, res) => {
  try {
    const filter = scopeFilter(req, { role: "teacher" });

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its teachers.",
      });
    }

    const teachers = await User.find(filter)
      .populate("subjects", "name code")
      .populate("teachingGrades", "name academicYear")
      .select(
        "firstName lastName phoneNumber email nationalId teachingGrades subjects",
      );

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء استرجاع البيانات: " + err.message,
    });
  }
};
// The subjects this teacher holds, optionally narrowed to one classroom.
// The app calls this to decide whether to show a subject picker at all: one
// subject back means there is nothing to choose, so no picker appears.
exports.getMySubjects = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id).populate(
      "subjects",
      "name code",
    );

    const all = teacher.subjects || [];
    let current = all;

    // Narrowed the same way the write endpoints narrow, so the picker never
    // offers a subject that a save would then reject.
    if ((req.query.classroomId || req.query.gradeId) && all.length > 1) {
      const outcome = await resolveTeacherSubject({
        teacher,
        classroomId: req.query.classroomId,
        gradeId: req.query.gradeId,
      });

      if (outcome.subjectId) {
        current = all.filter((s) => String(s._id) === outcome.subjectId);
      } else if (outcome.ambiguous) {
        const ids = outcome.options.map((o) => String(o._id));
        current = all.filter((s) => ids.includes(String(s._id)));
      }
    }

    res.status(200).json({
      success: true,
      data: {
        subjects: current,
        all,
        needsChoice: current.length > 1,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTeacherDashboard = async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res
        .status(403)
        .json({ message: "عذرًا، هذه الشاشة مخصصة للمعلمين فقط" });
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
        school: req.user.school,
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

// Account access (`active`) and per-user app feature toggles
// (`appFeatures`) are deliberately NOT editable through this endpoint —
// that control lives only on the platform owner's side now (see
// schoolController's user-management surface, called via
// PUT /admin/user/:id), not a school's own admin.
exports.updateTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      email,
      teachingGrades,
    } = req.body;

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
    if (!teacher || !sameSchool(req, teacher)) {
      return res
        .status(404)
        .json({ message: "sorry, the requested teacher was not found." });
    }

    const updateData = { firstName, lastName, phoneNumber, nationalId, email };

    const subjectIds = readSubjectIds(req.body);

    // Only rewritten when the request names subjects — an edit that just
    // changes a phone number must not strip the teacher of their subjects.
    if (subjectIds.length > 0) {
      const found = await Subject.countDocuments({
        _id: { $in: subjectIds },
        school: teacher.school,
      });
      if (found !== subjectIds.length) {
        return res
          .status(400)
          .json({ message: "sorry, the selected subject does not exist" });
      }
      updateData.subjects = subjectIds;
    }

    if (teachingGrades) {
      updateData.teachingGrades = teachingGrades;
    }

    const updatedTeacher = await User.findByIdAndUpdate(teacherId, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("subjects", "name code")
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

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
    if (!teacher || !sameSchool(req, teacher)) {
      return res
        .status(404)
        .json({ message: "sorry, the requested teacher was not found." });
    }

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
      message: "sorry, the teacher's account has been successfully deleted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
