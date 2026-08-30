const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const Behavior = require("../models/Behavior");
const HomeworkResult = require("../models/HomeworkResult");
const Result = require("../models/Result");
const User = require("../models/User");
const { buildStudentReport } = require("../utils/reportBuilder");

exports.getParentDashboard = async (req, res) => {
  try {
    const parentUser = await User.findById(req.user.id);
    const linkedIds = parentUser?.linkedStudents || [];
    const students = await Student.find({
      $or: [{ parent: req.user.id }, { _id: { $in: linkedIds } }],
    }).populate("classroom", "name grade");

    if (!students || students.length === 0) {
      return res.status(200).json({
        parentName: req.user.firstName,
        children: [],
      });
    }

    const childrenData = await Promise.all(
      students.map(async (student) => {
        const attendance = await Attendance.find({ student: student._id });
        const present = attendance.filter((a) => a.status === "present").length;
        const absent = attendance.filter((a) => a.status === "absent").length;

        const behaviors = await Behavior.find({ student: student._id })
          .populate("teacher", "firstName lastName")
          .sort({ createdAt: -1 });

        const homeworkResults = await HomeworkResult.find({
          student: student._id,
        })
          .populate("homework", "title subject")
          .sort({ createdAt: -1 });

        const examResults = await Result.find({ student: student._id })
          .populate("exam", "title subject totalMarks")
          .sort({ createdAt: -1 });

        return {
          studentInfo: {
            id: student._id,
            fullName: `${student.firstName} ${student.lastName}`,
            classroom: student.classroom ? student.classroom.name : "غير محدد",
            classroomId: student.classroom ? student.classroom._id : null,
            grade: student.classroom ? student.classroom.grade : "",
          },
          attendance: { present, absent, totalDays: attendance.length },
          behaviors,
          homeworkResults,
          examResults,
        };
      }),
    );
    res.status(200).json({
      parentName: req.user.firstName,
      children: childrenData,
    });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في السيرفر: " + err.message });
  }
};

const VALID_PERIODS = ["daily", "weekly", "monthly"];

exports.getStudentReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const period = VALID_PERIODS.includes(req.query.period)
      ? req.query.period
      : "weekly";

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const parentUser = await User.findById(req.user.id);
    const linkedIds = (parentUser?.linkedStudents || []).map((id) =>
      id.toString()
    );
    const isOwnChild =
      student.parent.toString() === req.user.id ||
      linkedIds.includes(student._id.toString());

    if (!isOwnChild) {
      return res.status(403).json({
        message: "غير مصرح لك بعرض تقرير هذا الطالب.",
      });
    }

    const report = await buildStudentReport(studentId, period);

    res.status(200).json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ message: "خطأ داخلي في السيرفر: " + err.message });
  }
};
