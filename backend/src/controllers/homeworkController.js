const Homework = require("../models/Homework");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const Student = require("../models/Student");
const { scopeFilter, sameSchool } = require("../utils/tenant");

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
          message: "غير مصرح لك بإضافة واجب لهذه المرحلة.",
        });
    }

    const classrooms = await Classroom.find({ grade: grade });
    if (classrooms.length === 0) {
      return res
        .status(404)
        .json({
          message: "لا يوجد فصول مسجّلة لهذه المرحلة حاليًا.",
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
      school: req.user.school,
    }));

    await Homework.insertMany(homeworkEntries);

    res.status(201).json({
      success: true,
      message: `تم إضافة الواجب بنجاح لـ ${classrooms.length} فصل في هذه المرحلة`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
exports.getAllHomeworks = async (req, res) => {
  try {
    const filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { teacher: req.user.id } : {},
    );

    if (!filter) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لعرض الواجبات.",
      });
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
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });
    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({
          message: "غير مصرح لك بعرض واجبات هذا الطالب",
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
      return res.status(404).json({ message: "الواجب غير موجود" });
    }

    if (homework.teacher.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بتعديل هذا الواجب" });
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
      message: "تم تحديث الواجب بنجاح",
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
      return res.status(404).json({ message: "الواجب غير موجود" });
    }

    if (
      homework.teacher.toString() !== req.user.id &&
      !(req.user.role === "admin" && sameSchool(req, homework))
    ) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بحذف هذا الواجب" });
    }

    await homework.deleteOne();

    res.status(200).json({
      success: true,
      message: "تم حذف الواجب بنجاح",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
