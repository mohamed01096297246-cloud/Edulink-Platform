const Attendance = require("../models/Attendance");
const Schedule = require("../models/Schedule");
const Student = require("../models/Student");
const mongoose = require("mongoose");
const sendCredentialsEmail = require("../utils/emailService.js");
const { scopeFilter } = require("../utils/tenant");

const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

const getActiveClass = async (teacherId, classroomId) => {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayName = days[new Date().getDay()];
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const schedules = await Schedule.find({
    teacher: teacherId,
    classroom: classroomId,
    day: dayName,
  });

  return schedules.find((sch) => {
    const start = timeToMinutes(sch.startTime);
    const end = timeToMinutes(sch.endTime);
    return currentTime >= start && currentTime <= end;
  });
};

exports.recordBulkAttendance = async (req, res) => {
  try {
    const { scheduleId, records, selectedDate } = req.body;
    if (!selectedDate || !scheduleId) {
      return res.status(400).json({
        success: false,
        message:
          "عذرًا، رقم الحصة والتاريخ مطلوبان لتسجيل الحضور.",
      });
    }

    if (!records || records.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "لا يوجد سجلات حضور. برجاء إضافة سجل واحد على الأقل للحفظ.",
      });
    }

    const validScheduleId = new mongoose.Types.ObjectId(scheduleId);

    const targetSchedule = await Schedule.findById(validScheduleId);
    if (!targetSchedule) {
      return res.status(404).json({
        success: false,
        message: "عذرًا، الحصة المختارة غير موجودة.",
      });
    }

    const [year, month, day] = selectedDate.split("-").map(Number);
    const pureDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    const existingAttendance = await Attendance.findOne({
      schedule: validScheduleId,
      date: pureDate,
    });

    if (existingAttendance) {
      return res.status(409).json({
        success: false,
        message:
          "عذرًا، تم تسجيل حضور هذه الحصة لهذا التاريخ بالفعل ولا يمكن تسجيله مرة أخرى.",
      });
    }

    const bulkOps = records.map((record) => ({
      insertOne: {
        document: {
          student: new mongoose.Types.ObjectId(record.student),
          schedule: validScheduleId,
          subject: targetSchedule.subject,
          date: pureDate,
          status: record.status,
          // Only an absence can carry an excuse — ignore the flag on a
          // present/late record rather than trusting whatever was sent.
          excused: record.status === "absent" && record.excused === true,
          recordedBy: new mongoose.Types.ObjectId(req.user.id),
          school: req.user.school,
        },
      },
    }));

    await Attendance.bulkWrite(bulkOps);

    return res.status(201).json({
      success: true,
      message: "تم حفظ سجلات الحضور بنجاح.",
    });
  } catch (err) {
    console.error("Attendance Bulk Error:", err);
    return res.status(500).json({
      success: false,
      message:
        "حدث خطأ أثناء حفظ سجلات الحضور: " +
        err.message,
    });
  }
};
exports.getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        message:
          "عذرًا، لا يمكنك عرض سجل حضور طالب ليس ابنك.",
      });
    }
    const data = await Attendance.find({ student: studentId })
      .populate("subject", "name")
      .populate({
        path: "schedule",
        populate: { path: "subject", select: "name" },
      })
      .sort({ date: -1 });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getAllAttendance = async (req, res) => {
  try {
    const filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { recordedBy: req.user.id } : {},
    );

    if (!filter) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لعرض الحضور.",
      });
    }

    const data = await Attendance.find(filter)
      .populate("student", "firstName lastName")
      .populate({
        path: "schedule",
        populate: { path: "subject", select: "name" },
      })
      .populate({
        path: "schedule",
        populate: {
          path: "classroom",
          select: "name grade",
          populate: { path: "grade", select: "name academicYear" },
        },
      })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getAttendanceById = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate("student", "firstName lastName")
      .populate({
        path: "schedule",
        populate: [
          { path: "subject", select: "name" },
          {
            path: "classroom",
            select: "name grade",
            populate: { path: "grade", select: "name academicYear" },
          },
        ],
      });

    if (!attendance)
      return res.status(404).json({ message: "سجل الحضور غير موجود" });

    res.json({ success: true, data: attendance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id).populate("student");
    if (!record)
      return res.status(404).json({ message: "سجل الحضور غير موجود" });

    const activeClass = await getActiveClass(
      req.user.id,
      record.student.classroom,
    );

    if (!activeClass) {
      return res.status(403).json({
        message:
          "عذرًا، لا يمكنك تعديل الحضور بعد انتهاء وقت الحصة الرسمي.",
      });
    }

    const updated = await Attendance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    res.json({ message: "تم تحديث الحضور بنجاح", updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
exports.checkExistingAttendance = async (req, res) => {
  try {
    const { classroomId, date } = req.query; 

    if (!classroomId || !date) {
      return res
        .status(400)
        .json({ success: false, message: "بيانات ناقصة." });
    }

    const [year, month, day] = date.split("-").map(Number);
    const pureDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    const records = await Attendance.find({
      schedule: new mongoose.Types.ObjectId(classroomId),
      date: pureDate,
    }).populate("student", "firstName lastName");

    return res.json({
      success: true,
      exists: records.length > 0,
      records: records,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
