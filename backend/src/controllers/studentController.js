const mongoose = require("mongoose");
const {
  generatePassword,
  resolveUsername,
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
      classroom: classroomId,
      parentFirstName,
      parentLastName,
      parentEmail,
      parentPhone,
    } = req.body;

    const school = creationSchool(req);
    if (!school) {
      throw new Error(
        "sorry, no school context found for this account. Please contact support.",
      );
    }

    if (!grade) {
      throw new Error("برجاء اختيار المرحلة الدراسية للطالب.");
    }

    // The classroom is no longer chosen at registration — a school signs a
    // student up knowing their grade long before it has decided which room
    // they sit in. Distributing students into classrooms is a separate step
    // (see assignStudentsToClassroom) done from the classroom's own screen,
    // so a student created here simply waits with a grade and no classroom
    // until an admin picks them for one.
    //
    // A classroomId is still honoured when the caller does send one — kept
    // for any older client still posting the old shape — with the same
    // validation this used to always run.
    let availableClassroom = null;

    if (classroomId) {
      availableClassroom = await Classroom.findOne({
        _id: classroomId,
        grade: grade,
        school,
      }).session(session);

      if (!availableClassroom) {
        throw new Error("الفصل المختار غير موجود ضمن هذه المرحلة الدراسية.");
      }

      if (availableClassroom.currentStudents >= availableClassroom.capacity) {
        throw new Error(
          `عذرًا، فصل (${availableClassroom.name}) وصل للحد الأقصى من الطلاب (${availableClassroom.capacity}). اختر فصلًا آخر.`,
        );
      }
    }

    // A parent's phone number is the one thing every family reliably has on
    // hand at registration, and it's what identifies "this is the same
    // parent as their other child" — a second child registered with the
    // same parent phone links to the existing account instead of creating a
    // duplicate one.
    if (!parentPhone) {
      throw new Error("برجاء إدخال رقم هاتف ولي الأمر.");
    }

    let finalParentId;
    let isNewParent = false;
    let generatedUser, generatedPass;

    let existingParent = await User.findOne({
      phoneNumber: parentPhone,
      role: "parent",
    }).session(session);

    if (existingParent) {
      if (existingParent.school.toString() !== school.toString()) {
        throw new Error(
          "sorry, a parent with this phone number is already registered at a different school and cannot be linked here.",
        );
      }
      finalParentId = existingParent._id;
    } else {
      // No parent account on this phone — but the same phone may still
      // belong to a teacher or admin at this school (a staff member whose
      // own child is being registered). That's allowed: phoneNumber is
      // unique per role, not globally, so a second account for the same
      // person is expected here, not an error. Only the username needs
      // resolving, since it would otherwise collide with that other
      // account's (both derive from the same digits).
      generatedUser = await resolveUsername(parentPhone, User);
      generatedPass = generatePassword();

      const newParentResult = await User.create(
        [
          {
            firstName: parentFirstName || lastName,
            lastName: parentLastName || "Family",
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
          classroom: availableClassroom ? availableClassroom._id : undefined,
          school,
        },
      ],
      { session },
    );

    const student = studentResult[0];

    if (availableClassroom) {
      await Classroom.findByIdAndUpdate(
        availableClassroom._id,
        { $inc: { currentStudents: 1 } },
        { session },
      );
    }

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
          "Parent",
          `${parentFirstName || lastName} ${parentLastName || "Family"}`,
          `${firstName} ${lastName}`,
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

    const placementNote = availableClassroom
      ? `assigned to classroom (${availableClassroom.name})`
      : "registered — not yet assigned to a classroom";

    res.status(201).json({
      success: true,
      message: isNewParent
        ? `sorry, the student has been ${placementNote} successfully, and login credentials have been sent to the parent.`
        : `sorry, the student has been ${placementNote} successfully, and linked to the existing parent account.`,
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

    const gradeChanged =
      req.body.grade && req.body.grade !== student.grade.toString();
    const classroomChanged =
      req.body.classroom &&
      req.body.classroom !== (student.classroom || "").toString();

    // Classroom assignment is manual, not auto-picked — a grade change
    // requires the admin to explicitly say which classroom in that grade
    // the student moves to (never silently pick whichever has room).
    if (gradeChanged && !req.body.classroom) {
      return res.status(400).json({
        message: "برجاء اختيار الفصل الجديد ضمن المرحلة المختارة.",
      });
    }

    if (gradeChanged || classroomChanged) {
      const targetClassroom = await Classroom.findOne({
        _id: req.body.classroom,
        grade: req.body.grade || student.grade,
        school: student.school,
      });

      if (!targetClassroom) {
        return res.status(400).json({
          message: "الفصل المختار غير موجود ضمن هذه المرحلة الدراسية.",
        });
      }

      if (targetClassroom.currentStudents >= targetClassroom.capacity) {
        return res.status(400).json({
          message: `عذرًا، فصل (${targetClassroom.name}) وصل للحد الأقصى من الطلاب (${targetClassroom.capacity}). اختر فصلًا آخر.`,
        });
      }

      if (student.classroom) {
        await Classroom.findByIdAndUpdate(student.classroom, {
          $inc: { currentStudents: -1 },
        });
      }

      await Classroom.findByIdAndUpdate(targetClassroom._id, {
        $inc: { currentStudents: 1 },
      });

      req.body.classroom = targetClassroom._id;
    } else if (req.body.classroom === "") {
      // The edit form now lets an admin leave a student unplaced ("بدون فصل
      // حاليًا"), which submits classroom as an empty string. Left in
      // req.body, Mongoose would try to cast "" to an ObjectId below and
      // throw — drop the key instead so a field the admin didn't actually
      // change is simply left alone.
      delete req.body.classroom;
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

// Students who have a grade but no classroom yet — the pool an admin picks
// from when populating a classroom (see assignStudentsToClassroom). Scoped
// to one grade because that's how the classroom-assignment screen works:
// open a classroom, see only the students who could actually belong there.
exports.getUnassignedStudents = async (req, res) => {
  try {
    const { grade } = req.query;

    if (!grade) {
      return res.status(400).json({
        success: false,
        message: "برجاء تحديد المرحلة الدراسية.",
      });
    }

    const filter = scopeFilter(req, { grade, classroom: null, active: true });
    if (!filter) {
      return res.status(400).json({
        success: false,
        message: "Please specify a school (?school=id) to list its students.",
      });
    }

    const students = await Student.find(filter)
      .select("firstName lastName gender phoneNumber")
      .sort({ firstName: 1 });

    res.status(200).json({ success: true, count: students.length, data: students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Places a batch of previously-unassigned students into one classroom in a
// single action — the counterpart to registration no longer asking for a
// classroom. Every student must already be grade-matched and currently
// unassigned; re-assigning a student who already has a classroom goes
// through updateStudent instead, which handles moving them out of the old
// one.
exports.assignStudentsToClassroom = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { classroomId, studentIds } = req.body;

    if (!classroomId) {
      throw new Error("برجاء اختيار الفصل.");
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new Error("برجاء اختيار طالب واحد على الأقل.");
    }

    const classroom = await Classroom.findById(classroomId).session(session);
    if (!classroom || !sameSchool(req, classroom)) {
      throw new Error("الفصل غير موجود.");
    }

    const students = await Student.find({
      _id: { $in: studentIds },
    }).session(session);

    if (students.length !== studentIds.length) {
      throw new Error("بعض الطلاب المحددين غير موجودين.");
    }

    const notInSchool = students.find(
      (s) => s.school.toString() !== classroom.school.toString(),
    );
    if (notInSchool) {
      throw new Error("بعض الطلاب المحددين ليسوا في نفس المدرسة.");
    }

    const wrongGrade = students.find(
      (s) => s.grade.toString() !== classroom.grade.toString(),
    );
    if (wrongGrade) {
      throw new Error(
        `الطالب ${wrongGrade.firstName} ${wrongGrade.lastName} من مرحلة مختلفة عن مرحلة هذا الفصل.`,
      );
    }

    const alreadyPlaced = students.find((s) => s.classroom);
    if (alreadyPlaced) {
      throw new Error(
        `الطالب ${alreadyPlaced.firstName} ${alreadyPlaced.lastName} منضم بالفعل لفصل آخر — استخدم تعديل بيانات الطالب لنقله.`,
      );
    }

    const seats = classroom.capacity - classroom.currentStudents;
    if (studentIds.length > seats) {
      throw new Error(
        `عذرًا، فصل (${classroom.name}) فيه ${seats} مقعد فاضي بس، وانت بتحاول تضيف ${studentIds.length} طالب.`,
      );
    }

    await Student.updateMany(
      { _id: { $in: studentIds } },
      { $set: { classroom: classroomId } },
      { session },
    );

    await Classroom.findByIdAndUpdate(
      classroomId,
      { $inc: { currentStudents: studentIds.length } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `تم إضافة ${studentIds.length} طالب إلى فصل (${classroom.name}) بنجاح.`,
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(400).json({ success: false, message: err.message });
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
