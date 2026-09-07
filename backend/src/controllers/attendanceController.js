const Attendance = require("../models/Attendance");
const Schedule = require("../models/Schedule");
const CoverSession = require("../models/CoverSession");
const School = require("../models/School");
const Student = require("../models/Student");
const mongoose = require("mongoose");
const { scopeFilter } = require("../utils/tenant");
const {
  getAttendanceWindow,
  WINDOW_MESSAGES,
} = require("../utils/attendanceWindow");

// Cached per request path rather than per process: a school's timezone
// effectively never changes, but reading it fresh keeps a correction taking
// effect without a redeploy.
const schoolTimezone = async (schoolId) => {
  if (!schoolId) return "Africa/Cairo";

  const school = await School.findById(schoolId).select("timezone").lean();
  return school?.timezone || "Africa/Cairo";
};

exports.recordBulkAttendance = async (req, res) => {
  try {
    const { scheduleId, coverSessionId, records, selectedDate } = req.body;

    if (!scheduleId && !coverSessionId) {
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

    // A cover lesson carries its own date and times; a timetabled one is
    // filed against the date the teacher is looking at.
    let session = null;
    let targetSchedule = null;
    let dateStr = selectedDate;

    if (coverSessionId) {
      session = await CoverSession.findById(coverSessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          message: "حصة الاحتياط غير موجودة.",
        });
      }

      if (String(session.teacher) !== String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "حصة الاحتياط دي مش بتاعتك.",
        });
      }

      dateStr = session.date.toISOString().slice(0, 10);
    } else {
      if (!selectedDate) {
        return res.status(400).json({
          success: false,
          message:
            "عذرًا، رقم الحصة والتاريخ مطلوبان لتسجيل الحضور.",
        });
      }

      targetSchedule = await Schedule.findById(
        new mongoose.Types.ObjectId(scheduleId),
      );

      if (!targetSchedule) {
        return res.status(404).json({
          success: false,
          message: "عذرًا، الحصة المختارة غير موجودة.",
        });
      }
    }

    // The register closes for good 15 minutes after the bell — the same rule
    // for a cover lesson as for a timetabled one. Enforced here and not only
    // in the app: the app's countdown runs off the phone's own clock, which a
    // teacher can wind back, so the app's lock is a courtesy and this is the
    // rule.
    const window = getAttendanceWindow({
      schedule: session || targetSchedule,
      dateStr,
      timeZone: await schoolTimezone(req.user.school),
    });

    if (!window.canRecord) {
      return res.status(403).json({
        success: false,
        message: WINDOW_MESSAGES[window.state] || WINDOW_MESSAGES.closed,
        window,
      });
    }

    const [year, month, day] = dateStr.split("-").map(Number);
    const pureDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    const existingAttendance = await Attendance.findOne(
      session
        ? { coverSession: session._id }
        : { schedule: targetSchedule._id, date: pureDate },
    );

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
          // Exactly one of these is set. A cover record deliberately carries
          // no subject: it is supervision outside the teacher's own subject,
          // and every grade calculation keys off `subject`, so leaving it
          // unset is what keeps it out of the marks.
          ...(session
            ? { coverSession: session._id }
            : { schedule: targetSchedule._id, subject: targetSchedule.subject }),
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
    // The parent's attendance list drives the rate they see, so it shows
    // timetabled lessons only — a cover lesson is a colleague's class the
    // teacher was standing in for, and counting it would change a number it
    // has no bearing on.
    const data = await Attendance.find({
      student: studentId,
      ...Attendance.GRADED_ONLY,
    })
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

    // Timetabled lessons only: every row in this list is rendered through
    // its schedule (subject, classroom, grade), which a cover record does not
    // have. Cover attendance is read back through the cover-session roster
    // instead.
    const data = await Attendance.find({ ...filter, ...Attendance.GRADED_ONLY })
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
    const record = await Attendance.findById(req.params.id).populate("schedule");
    if (!record)
      return res.status(404).json({ message: "سجل الحضور غير موجود" });

    // A correction is bound by the same deadline as the original entry —
    // otherwise the lock would be trivially bypassed by saving something and
    // editing it later.
    const dateStr = record.date.toISOString().slice(0, 10);
    const window = getAttendanceWindow({
      schedule: record.schedule,
      dateStr,
      timeZone: await schoolTimezone(req.user.school),
    });

    if (!window.canRecord) {
      return res.status(403).json({
        message: WINDOW_MESSAGES[window.state] || WINDOW_MESSAGES.closed,
        window,
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
    // `classroomId` is the schedule's id — the query parameter is misnamed,
    // but the app already sends it under that key.
    const { classroomId, date } = req.query;

    if (!classroomId || !date) {
      return res
        .status(400)
        .json({ success: false, message: "بيانات ناقصة." });
    }

    const scheduleId = new mongoose.Types.ObjectId(classroomId);

    const [year, month, day] = date.split("-").map(Number);
    const pureDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    const [records, schedule] = await Promise.all([
      Attendance.find({ schedule: scheduleId, date: pureDate }).populate(
        "student",
        "firstName lastName",
      ),
      Schedule.findById(scheduleId),
    ]);

    // Shipped alongside the records so the app can render the countdown and
    // the locked state without doing its own timezone maths — and so both
    // sides always agree on the deadline. `serverTime` lets the app correct
    // for a phone clock that is off.
    const window = getAttendanceWindow({
      schedule,
      dateStr: date,
      timeZone: await schoolTimezone(req.user.school),
    });

    return res.json({
      success: true,
      exists: records.length > 0,
      records,
      window,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
