const mongoose = require("mongoose");
const {
  generateUsername,
  generatePassword,
} = require("../utils/generateCredentials");
const { sendCredentialsEmail } = require("../utils/emailService");
const { friendlyDuplicateKeyMessage } = require("../utils/formatDbError");
const User = require("../models/User");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      email,
      gender,
      grade,
      parentFirstName,
      parentLastName,
      parentNationalId,
      parentEmail,
      parentPhone,
    } = req.body;

    const school = creationSchool(req);
    if (!school) {
      throw new Error(
        "sorry, no school context found for this account. Please contact support.",
      );
    }

    const availableClassroom = await Classroom.findOne({
      grade: grade,
      school,
      $expr: { $lt: ["$currentStudents", "$capacity"] },
    }).session(session);

    if (!availableClassroom) {
      throw new Error(
        "sorry, there are no available classrooms in this grade level. Please create a new classroom first.",
      );
    }

    if (!parentNationalId) {
      throw new Error(
        "sorry, the national ID for the parent is required to verify their identity",
      );
    }

    let finalParentId;
    let isNewParent = false;
    let generatedUser, generatedPass;

    let existingParent = await User.findOne({
      nationalId: parentNationalId,
      role: "parent",
    }).session(session);

    if (existingParent) {
      if (existingParent.school.toString() !== school.toString()) {
        throw new Error(
          "sorry, a parent with this national ID is already registered at a different school and cannot be linked here.",
        );
      }
      finalParentId = existingParent._id;
    } else {
      if (!parentPhone) {
        throw new Error(
          "sorry, phone number for the parent is required to create a new account",
        );
      }

      // Username is derived from the phone number (see generateCredentials.js),
      // and phoneNumber is unique across every account (parent/teacher/admin) —
      // so a phone already in use anywhere would otherwise fail as a raw
      // duplicate-key error at the insert below. Check it up front instead,
      // with a message that actually explains what happened.
      const phoneInUse = await User.findOne({
        phoneNumber: parentPhone,
      }).session(session);
      if (phoneInUse) {
        throw new Error(
          "عذرًا، رقم هاتف ولي الأمر هذا مسجّل بالفعل بحساب آخر. تأكد من الرقم أو تحقق من الرقم القومي المدخل إذا كان هذا هو نفس ولي الأمر.",
        );
      }

      generatedUser = generateUsername(parentPhone);
      generatedPass = generatePassword();

      const newParentResult = await User.create(
        [
          {
            firstName: parentFirstName || lastName,
            lastName: parentLastName || "Family",
            nationalId: parentNationalId,
            phoneNumber: parentPhone,
            email: parentEmail,
            role: "parent",
            school,
            username: generatedUser,
            password: generatedPass,
            active: true,
          },
        ],
        { session },
      );
      finalParentId = newParentResult[0]._id;
      isNewParent = true;
    }

    const studentResult = await Student.create(
      [
        {
          firstName,
          lastName,
          phoneNumber,
          email,
          gender,
          grade,
          parent: finalParentId,
          classroom: availableClassroom._id,
          school,
        },
      ],
      { session },
    );

    const student = studentResult[0];

    await Classroom.findByIdAndUpdate(
      availableClassroom._id,
      { $inc: { currentStudents: 1 } },
      { session },
    );

    await User.findByIdAndUpdate(
      finalParentId,
      { $addToSet: { linkedStudents: student._id } },
      { session },
    );

    if (isNewParent && parentEmail) {
      try {
        await sendCredentialsEmail(
          parentEmail,
          generatedUser,
          generatedPass,
          "ولي أمر",
        );
      } catch (emailErr) {
        throw new Error(
          "sorry, could not send login credentials to the parent. Student registration has been cancelled. Reason: " +
            emailErr.message,
        );
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: isNewParent
        ? `sorry, the student has been created and assigned to classroom (${availableClassroom.name}) successfully, and login credentials have been sent to the parent.`
        : `sorry, the student has been created and assigned to classroom (${availableClassroom.name}) successfully, and linked to the existing parent account.`,
      data: student,
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res
      .status(400)
      .json({ error: friendlyDuplicateKeyMessage(err) || err.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const studentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const student = await Student.findById(studentId);
    if (!student || !sameSchool(req, student)) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (req.body.grade && req.body.grade !== student.grade.toString()) {
      const availableClassroom = await Classroom.findOne({
        grade: req.body.grade,
        school: student.school,
        $expr: { $lt: ["$currentStudents", "$capacity"] },
      });

      if (!availableClassroom) {
        return res.status(400).json({
          message:
            "Sorry, there are no available classrooms in this new grade level. Please create a new classroom first.",
        });
      }

      if (student.classroom) {
        await Classroom.findByIdAndUpdate(student.classroom, {
          $inc: { currentStudents: -1 },
        });
      }

      await Classroom.findByIdAndUpdate(availableClassroom._id, {
        $inc: { currentStudents: 1 },
      });

      req.body.classroom = availableClassroom._id;
    }

    if (req.body.parent && req.body.parent !== student.parent.toString()) {
      const parentUser = await User.findById(req.body.parent);
      if (
        !parentUser ||
        parentUser.role !== "parent" ||
        parentUser.school?.toString() !== student.school.toString()
      ) {
        return res.status(400).json({ message: "Invalid parent ID" });
      }
      await User.findByIdAndUpdate(student.parent, {
        $pull: { linkedStudents: student._id },
      });
      await User.findByIdAndUpdate(req.body.parent, {
        $addToSet: { linkedStudents: student._id },
      });
    }

    // `school` is never editable from the client — a student can't be
    // silently moved to a different tenant via this endpoint.
    delete req.body.school;

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      req.body,
      { new: true, runValidators: true },
    )
      .populate("parent")
      .populate("classroom", "name")
      .populate("grade", "name academicYear");

    res.status(200).json({
      success: true,
      message: "sorry, the student's data has been updated successfully",
      data: updatedStudent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const studentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid ID" });
    }

    const student = await Student.findById(studentId).session(session);
    if (!student || !sameSchool(req, student)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Student not found" });
    }

    if (student.classroom) {
      await Classroom.findByIdAndUpdate(
        student.classroom,
        {
          $inc: { currentStudents: -1 },
        },
        { session },
      );
    }

    if (student.parent) {
      await User.findByIdAndUpdate(
        student.parent,
        {
          $pull: { linkedStudents: student._id },
        },
        { session },
      );
    }

    await student.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Student record and classroom association deleted successfully",
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ error: err.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const { classroomId } = req.query;
    let filter = scopeFilter(req, classroomId ? { classroom: classroomId } : {});

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its students.",
      });
    }

    let students = [];

    if (req.user.role === "admin") {
      students = await Student.find(filter)
        .populate("parent")
        .populate("grade", "name academicYear")
        .populate("classroom", "name");
    } else if (req.user.role === "teacher") {
      if (!classroomId) {
        return res.status(400).json({
          message:
            "sorry, please select a classroom first to view the list of students.",
        });
      }
      students = await Student.find(filter)
        .populate("parent")
        .populate("grade", "name academicYear")
        .populate("classroom", "name");
    }

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const student = await Student.findById(req.params.id)
      .populate("parent")
      .populate("grade", "name academicYear")
      .populate("classroom", "name");

    if (!student || !sameSchool(req, student)) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (
      req.user.role === "parent" &&
      student.parent._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.user.role === "teacher") {
      return res.status(403).json({
        message:
          "sorry, teachers do not have permission to view student profiles directly.",
      });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudentsByParent = async (req, res) => {
  try {
    const parentId = req.params.parentId;
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({ message: "Invalid parent ID" });
    }
    if (req.user.role === "parent" && req.user._id.toString() !== parentId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Same policy as getStudent: teachers don't get student profiles
    // through any route, and an admin/teacher passing an arbitrary
    // parentId here previously had no school check at all — any admin
    // could read any parent's children across every school on the
    // platform. Verify the parent actually belongs to the caller's school
    // before returning anything.
    if (req.user.role === "teacher") {
      return res.status(403).json({
        message:
          "sorry, teachers do not have permission to view student profiles directly.",
      });
    }
    if (req.user.role === "admin") {
      const parentUser = await User.findOne({ _id: parentId, role: "parent" });
      if (!parentUser || !sameSchool(req, parentUser)) {
        return res.status(404).json({ message: "Parent not found" });
      }
    }

    const students = await Student.find({ parent: parentId })
      .populate("grade", "name academicYear")
      .populate("classroom", "name");

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
