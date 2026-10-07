const mongoose = require("mongoose");
const Result = require("../models/Result");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Exam = require("../models/Exam");
const { teacherClassPairs, teacherClassroomIds } = require("../utils/teacherClassrooms");
const { sameSchool } = require("../utils/tenant");
const User = require("../models/User");
const { teacherMayUse } = require("../utils/teacherSubject");

exports.getTeacherGrades = async (req, res) => {
  try {
    // Timetabled classes and assigned ones alike (utils/teacherClassrooms).
    const classrooms = await Classroom.find({
      _id: { $in: await teacherClassroomIds(req.user.id) },
    }).populate("grade");

    const gradesMap = new Map();
    classrooms.forEach((classroom) => {
      if (classroom.grade) {
        const grade = classroom.grade;
        gradesMap.set(grade._id.toString(), grade);
      }
    });

    return res.status(200).json({
      success: true,
      data: Array.from(gradesMap.values()),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamsAndClassroomsByGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;

    if (!gradeId) {
      return res
        .status(400)
        .json({ success: false, message: "رقم المرحلة مطلوب." });
    }

    const pairs = await teacherClassPairs(req.user.id);
    const inGrade = await Classroom.find({
      _id: { $in: pairs.map((p) => p.classroom) },
      grade: new mongoose.Types.ObjectId(gradeId),
    });

    const classroomsMap = new Map(inGrade.map((c) => [c._id.toString(), c]));
    const subjectsSet = new Set(
      pairs
        .filter((p) => p.subject && classroomsMap.has(String(p.classroom)))
        .map((p) => String(p.subject)),
    );

    const exams = await Exam.find({
      grade: new mongoose.Types.ObjectId(gradeId),
      "timetable.subject": { $in: Array.from(subjectsSet) },
    }).populate("timetable.subject", "name");

    return res.status(200).json({
      success: true,
      classrooms: Array.from(classroomsMap.values()),
      exams: exams,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getClassroomStudentsForMarks = async (req, res) => {
  try {
    const { classroomId } = req.params;

    const students = await Student.find({ classroom: classroomId })
      .select("firstName lastName")
      .sort({ firstName: 1 });

    return res.status(200).json({
      success: true,
      data: students,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Before any exam mark is written: the exam and every student must be the
// caller's own school's (and stage's), and a teacher may only mark a subject
// they hold, for students in classes they teach. Sends the refusal itself
// and returns false, or returns true to carry on.
const mayWriteMarks = async (req, res, { examId, subjectId, studentIds }) => {
  const exam = await Exam.findById(examId).select("school grade");
  if (!exam || !sameSchool(req, exam)) {
    res.status(404).json({ success: false, message: "الامتحان غير موجود." });
    return false;
  }

  const ids = [...new Set((studentIds || []).map(String))];
  const students = await Student.find({ _id: { $in: ids } }).select("school grade classroom");
  if (students.length !== ids.length || students.some((s) => !sameSchool(req, s))) {
    res.status(403).json({ success: false, message: "فيه طالب مش من طلابك." });
    return false;
  }

  if (req.user.role === "teacher") {
    const teacher = await User.findById(req.user.id).select("subjects teachingGrades school");
    const holds = (teacher.subjects || []).some((id) => String(id) === String(subjectId));
    if (!holds) {
      res.status(403).json({ success: false, message: "المادة دي مش من موادك." });
      return false;
    }
    const classes = [...new Set(students.map((s) => String(s.classroom)))];
    for (const classroomId of classes) {
      if (!(await teacherMayUse(teacher, { classroomId }))) {
        res.status(403).json({ success: false, message: "فيه طالب مش من فصولك." });
        return false;
      }
    }
  }
  return true;
};

// An existing mark is the school's of the student it belongs to.
const markInReach = async (req, result) => {
  if (!result) return false;
  const student = await Student.findById(result.student).select("school grade classroom");
  return Boolean(student && sameSchool(req, student));
};

exports.addGrade = async (req, res) => {
  try {
    const { studentId, examId, subjectId, grade } = req.body;
    if (!(await mayWriteMarks(req, res, { examId, subjectId, studentIds: [studentId] }))) return undefined;

    const result = await Result.findOneAndUpdate(
      { student: studentId, exam: examId, subject: subjectId },
      { grade, teacher: req.user.id, school: req.user.school },
      { upsert: true, new: true },
    );

    res
      .status(200)
      .json({ success: true, message: "تم تسجيل الدرجة بنجاح", result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getReportCard = async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const student = await Student.findById(studentId)
      .populate("parent", "firstName lastName")
      .populate("grade", "name academicYear")
      .populate("classroom", "name");

    if (!student || !sameSchool(req, student)) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    // Same ownership gap as the other student-scoped endpoints — a parent
    // could otherwise read any student's exam report card by guessing an id.
    if (
      req.user.role === "parent" &&
      student.parent._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message: "غير مصرح لك بعرض كشف درجات هذا الطالب.",
      });
    }

    const grades = await Result.find({ student: studentId, exam: examId })
      .populate("subject", "name")
      .populate("exam", "title academicYear");

    if (grades.length === 0)
      return res.status(404).json({ message: "لا يوجد درجات مسجّلة بعد" });

    let totalStudentMarks = 0;
    let totalMaxMarks = grades.length * 100;

    grades.forEach((g) => {
      totalStudentMarks += g.grade;
    });

    res.status(200).json({
      success: true,
      data: {
        reportTitle: `نتيجة امتحانات ${student.firstName}`,
        academicYear: grades[0].exam?.academicYear || "",
        examName: grades[0].exam?.title || "امتحان غير معروف",
        subjects: grades,
        summary: {
          studentTotal: totalStudentMarks,
          maxTotal: totalMaxMarks,
          percentage:
            ((totalStudentMarks / totalMaxMarks) * 100).toFixed(2) + "%",
        },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.addBulkGrades = async (req, res) => {
  try {
    const { examId, subjectId, gradesList } = req.body;

    if (!gradesList || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "لازم ترسل قائمة درجات" });
    }
    const studentIds = gradesList.map((r) => r.studentId);
    if (!(await mayWriteMarks(req, res, { examId, subjectId, studentIds }))) return undefined;
    const existingResults = await Result.find({
      exam: examId,
      subject: subjectId,
      student: { $in: studentIds },
    });
    const isAlreadyRecorded = existingResults.length > 0;
    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: { student: record.studentId, exam: examId, subject: subjectId },
        update: {
          $set: {
            grade: record.grade,
            teacher: req.user.id,
            school: req.user.school,
          },
        },
        upsert: true,
      },
    }));
    await Result.bulkWrite(bulkOps);
    if (isAlreadyRecorded) {
      return res.status(200).json({
        success: true,
        isUpdate: true,
        message: "تم تحديث الدرجات بنجاح! 📝",
      });
    } else {
      return res.status(200).json({
        success: true,
        isUpdate: false,
        message: "تم حفظ الدرجات بنجاح! 🚀",
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
exports.updateGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const { grade } = req.body;

    if (grade < 0 || grade > 100) {
      return res
        .status(400)
        .json({ message: "الدرجة لازم تكون بين 0 و100" });
    }

    if (!(await markInReach(req, await Result.findById(id).select("student")))) {
      return res.status(404).json({ message: "سجل الدرجة غير موجود" });
    }

    const updatedResult = await Result.findByIdAndUpdate(
      id,
      {
        grade,
        updatedBy: req.user.id,
      },
      { new: true, runValidators: true },
    )
      .populate({
        path: "student",
        select: "firstName lastName",
        populate: [
          { path: "grade", select: "name academicYear" },
          { path: "classroom", select: "name" },
        ],
      })
      .populate("subject", "name")
      .populate("exam", "title academicYear");

    if (!updatedResult) {
      return res.status(404).json({ message: "سجل الدرجة غير موجود" });
    }

    res.status(200).json({
      success: true,
      message: "تم تحديث الدرجة بنجاح بواسطة الإدارة",
      data: updatedResult,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await markInReach(req, await Result.findById(id).select("student")))) {
      return res.status(404).json({ message: "سجل الدرجة غير موجود" });
    }
    await Result.deleteOne({ _id: id });

    res
      .status(200)
      .json({ success: true, message: "تم حذف سجل الدرجة بنجاح" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
