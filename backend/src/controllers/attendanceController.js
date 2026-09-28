const Attendance = require("../models/Attendance");
const Schedule = require("../models/Schedule");
const CoverSession = require("../models/CoverSession");
const School = require("../models/School");
const Student = require("../models/Student");
const mongoose = require("mongoose");
const { scopeFilter, mergeWhere, stageStudentWhere } = require("../utils/tenant");
const {
  getAttendanceWindow,
  WINDOW_MESSAGES,
  todayInZone,
  weekdayOf,
  zonedTimeToInstant,
} = require("../utils/attendanceWindow");
const { runFor, anchorOf } = require("../utils/consecutivePeriods");
const {
  clock,
  isDailyMode,
  dailyState,
  utcMidnight,
  DAILY_MESSAGES,
} = require("../utils/dailyAttendance");

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

    // A school on the daily register files one register a class a day, on
    // its first lesson — whichever of the class's lessons it is taken from.
    if (targetSchedule && (await isDailyMode(req.user.school))) {
      return recordDaily(req, res, targetSchedule, dateStr, records);
    }

    // A double lesson takes one register, filed on its last period. Resolved
    // here rather than trusted from the app, so a build that still lists
    // both periods separately lands on the same record whichever one the
    // teacher taps — and can't file the lesson twice.
    let run = [];
    if (targetSchedule) {
      run = await runFor(targetSchedule);
      targetSchedule = anchorOf(run);
    }

    // The register stays open until the end of the week's Saturday — the
    // same rule for a cover lesson as for a timetabled one. Enforced here and
    // not only in the app, whose clock a teacher can change.
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
        : { schedule: { $in: run.map((s) => s._id) }, date: pureDate },
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

// ---- the daily register (School.attendanceMode "daily") -------------------
// See utils/dailyAttendance.js. Taken once a day per class, in the first
// period; later teachers of the class may only add absentees; the school
// day's end closes it for good.

const teachesLesson = (schedule, req) => String(schedule.teacher) === String(req.user.id);

const refusedByWindow = (res, window) =>
  res.status(403).json({
    success: false,
    message: DAILY_MESSAGES[window.state] || DAILY_MESSAGES.closed,
    window,
  });

async function recordDaily(req, res, schedule, dateStr, records) {
  if (!teachesLesson(schedule, req)) {
    return res.status(403).json({ success: false, message: "الحصة دي مش في جدولك." });
  }

  const state = await dailyState({
    classroomId: schedule.classroom,
    dateStr,
    timeZone: await schoolTimezone(req.user.school),
  });
  if (!state.window.canRecord) return refusedByWindow(res, state.window);

  if (state.taken) {
    return res.status(409).json({
      success: false,
      message:
        "الغياب اتاخد النهارده بالفعل في الحصة الأولى — تقدر تضيف طلاب غياب جداد بس.",
    });
  }

  const first = state.first;
  await Attendance.bulkWrite(
    records.map((record) => ({
      insertOne: {
        document: {
          student: new mongoose.Types.ObjectId(record.student),
          schedule: first._id,
          subject: first.subject?._id || first.subject,
          date: utcMidnight(dateStr),
          status: record.status,
          excused: record.status === "absent" && record.excused === true,
          recordedBy: new mongoose.Types.ObjectId(req.user.id),
          school: req.user.school,
        },
      },
    })),
  );

  return res.status(201).json({ success: true, message: "تم حفظ غياب اليوم بنجاح." });
}

// A later teacher of the class adding students who are missing now. Only
// ever adds absences — nobody but the day's register takes one away — and
// only until the school day ends.
exports.addDailyAbsentees = async (req, res) => {
  try {
    const { scheduleId, selectedDate, students } = req.body;
    if (!(await isDailyMode(req.user.school))) {
      return res.status(400).json({ success: false, message: "المدرسة دي مش شغالة بالغياب اليومي." });
    }
    if (!scheduleId || !selectedDate || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: "اختار الطلاب الغايبين الأول." });
    }

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule || !teachesLesson(schedule, req)) {
      return res.status(403).json({ success: false, message: "الحصة دي مش في جدولك." });
    }

    const state = await dailyState({
      classroomId: schedule.classroom,
      dateStr: selectedDate,
      timeZone: await schoolTimezone(req.user.school),
    });
    if (!state.window.canRecord) return refusedByWindow(res, state.window);
    if (!state.taken) {
      return res.status(400).json({
        success: false,
        message: "الغياب لسه ما اتاخدش النهارده — سجّله الأول لكل الفصل.",
      });
    }

    const roster = new Set(
      (await Student.find({ classroom: schedule.classroom, active: true }).distinct("_id")).map(String),
    );
    const recordOf = new Map(state.records.map((r) => [String(r.student?._id || r.student), r]));
    const now = clock.now();
    let added = 0;

    for (const item of students) {
      const id = String(item.student || item);
      if (!roster.has(id)) continue;
      const excusedFlag = item.excused === true;
      const existing = recordOf.get(id);

      if (existing?.status === "absent") continue;
      if (existing) {
        // eslint-disable-next-line no-await-in-loop -- a handful of students.
        await Attendance.updateOne(
          { _id: existing._id },
          { $set: { status: "absent", excused: excusedFlag, addedBy: req.user.id, addedAt: now } },
        );
      } else {
        // eslint-disable-next-line no-await-in-loop
        await Attendance.create({
          student: id,
          schedule: state.first._id,
          subject: state.first.subject?._id || state.first.subject,
          date: utcMidnight(selectedDate),
          status: "absent",
          excused: excusedFlag,
          recordedBy: req.user.id,
          addedBy: req.user.id,
          addedAt: now,
          school: req.user.school,
        });
      }
      added += 1;
    }

    return res.status(200).json({
      success: true,
      added,
      message: added ? `تمت إضافة ${added} طالب للغياب.` : "الطلاب دول متسجلين غياب بالفعل.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// The teacher's home screen: for each class they teach today, whether the
// day's register has been taken and who is absent — so a teacher walking
// into a class later in the day sees it straight away and can add anyone
// else who is missing.
exports.getDailyToday = async (req, res) => {
  try {
    if (!(await isDailyMode(req.user.school))) {
      return res.json({ success: true, data: { enabled: false, classes: [] } });
    }

    const timeZone = await schoolTimezone(req.user.school);
    const now = clock.now();
    const dateStr = todayInZone(timeZone, now);
    const day = weekdayOf(dateStr);

    const mine = await Schedule.find({ teacher: req.user.id, day })
      .populate({ path: "classroom", select: "name grade", populate: { path: "grade", select: "name" } })
      .sort({ period: 1 });

    const byClass = new Map();
    for (const lesson of mine) {
      if (!lesson.classroom) continue;
      const key = String(lesson.classroom._id);
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key).push(lesson);
    }

    const classes = [];
    for (const [classroomId, lessons] of byClass) {
      // eslint-disable-next-line no-await-in-loop -- a teacher's few classes.
      const state = await dailyState({ classroomId, dateStr, timeZone, now });
      const startsAt = (l) => zonedTimeToInstant(dateStr, l.startTime, timeZone);
      const endsAt = (l) => zonedTimeToInstant(dateStr, l.endTime, timeZone);
      const current = lessons.find((l) => startsAt(l) <= now && now < endsAt(l));
      const started = lessons.filter((l) => startsAt(l) <= now);
      const lesson = current || started.at(-1) || lessons[0];

      classes.push({
        classroomId,
        classroom: lessons[0].classroom.name,
        grade: lessons[0].classroom.grade?.name || "",
        scheduleId: lesson._id,
        startTime: lesson.startTime,
        started: started.length > 0,
        current: Boolean(current),
        taken: state.taken,
        absentees: state.absentees,
        canAdd: state.taken && state.window.canRecord,
        canTake: !state.taken && state.window.canRecord,
        closesAt: state.window.closesAt,
        firstLesson: state.first
          ? {
              period: state.first.period,
              subject: state.first.subject?.name || "",
              teacher: state.first.teacher
                ? `${state.first.teacher.firstName} ${state.first.teacher.lastName}`
                : "",
              isMine: String(state.first.teacher?._id) === String(req.user.id),
            }
          : null,
      });
    }

    return res.json({ success: true, data: { enabled: true, date: dateStr, classes } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Which of the teacher's lessons open their class's day — the ones whose
// register is theirs to take, and so the ones the app sets the attendance
// alarm for on the phone itself (it rings even with no connection).
exports.getDailyFirstLessons = async (req, res) => {
  try {
    if (!(await isDailyMode(req.user.school))) {
      return res.json({ success: true, data: { enabled: false, lessons: [] } });
    }

    const mine = await Schedule.find({ teacher: req.user.id })
      .populate("classroom", "name")
      .select("classroom day period startTime endTime");
    const classroomIds = [...new Set(mine.map((l) => String(l.classroom?._id || l.classroom)))];
    const all = await Schedule.find({ classroom: { $in: classroomIds } })
      .select("classroom day period startTime")
      .sort({ period: 1, startTime: 1 })
      .lean();

    const firstOf = new Map();
    for (const lesson of all) {
      const key = `${lesson.classroom}|${lesson.day}`;
      if (!firstOf.has(key)) firstOf.set(key, String(lesson._id));
    }

    const lessons = mine
      .filter((l) => firstOf.get(`${l.classroom?._id || l.classroom}|${l.day}`) === String(l._id))
      .map((l) => ({
        scheduleId: l._id,
        classroomId: l.classroom?._id || l.classroom,
        classroom: l.classroom?.name || "",
        day: l.day,
        period: l.period,
        startTime: l.startTime,
        endTime: l.endTime,
      }));

    return res.json({ success: true, data: { enabled: true, alarmLeadMinutes: 10, lessons } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
    let filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { recordedBy: req.user.id } : {},
    );

    if (!filter) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لعرض الحضور.",
      });
    }

    // Attendance names no grade of its own — the student it is about is
    // what places it in a stage.
    filter = mergeWhere(filter, await stageStudentWhere(req));

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

    // A correction is bound by the same end-of-week deadline as the original
    // entry — otherwise the lock would be bypassed by editing it later.
    const dateStr = record.date.toISOString().slice(0, 10);
    const timeZone = await schoolTimezone(req.user.school);
    // On the daily register the day's end is the deadline, not the week's.
    const window =
      record.schedule && (await isDailyMode(req.user.school))
        ? (await dailyState({ classroomId: record.schedule.classroom, dateStr, timeZone })).window
        : getAttendanceWindow({ schedule: record.schedule, dateStr, timeZone });

    if (!window.canRecord) {
      return res.status(403).json({
        message: window.daily
          ? DAILY_MESSAGES[window.state] || DAILY_MESSAGES.closed
          : WINDOW_MESSAGES[window.state] || WINDOW_MESSAGES.closed,
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

    const schedule = await Schedule.findById(scheduleId);

    // The daily register: any of the class's lessons that day shows the one
    // register taken in the first period, and says whether this teacher can
    // still add absentees to it.
    if (schedule && (await isDailyMode(req.user.school))) {
      const state = await dailyState({
        classroomId: schedule.classroom,
        dateStr: date,
        timeZone: await schoolTimezone(req.user.school),
      });
      return res.json({
        success: true,
        exists: state.taken,
        records: state.records,
        window: state.window,
        merged: null,
        daily: {
          taken: state.taken,
          isFirst: Boolean(state.first) && String(state.first._id) === String(schedule._id),
          firstLesson: state.first
            ? {
                period: state.first.period,
                subject: state.first.subject?.name || "",
                teacher: state.first.teacher
                  ? `${state.first.teacher.firstName} ${state.first.teacher.lastName}`
                  : "",
              }
            : null,
          absentees: state.absentees,
          canAdd: state.taken && state.window.canRecord,
        },
      });
    }

    // Either period of a double lesson shows the one shared register, so
    // opening the first period after the lesson was filed reads as filed.
    const run = schedule ? await runFor(schedule) : [];
    const anchor = run.length ? anchorOf(run) : null;

    const records = await Attendance.find({
      schedule: { $in: run.length ? run.map((s) => s._id) : [scheduleId] },
      date: pureDate,
    }).populate("student", "firstName lastName");

    // Shipped alongside the records so the app can render the locked state
    // without doing its own timezone maths — and so both sides always agree
    // on the deadline. `serverTime` lets the app correct for a phone clock
    // that is off.
    const window = getAttendanceWindow({
      schedule: anchor || schedule,
      dateStr: date,
      timeZone: await schoolTimezone(req.user.school),
    });

    return res.json({
      success: true,
      exists: records.length > 0,
      records,
      window,
      merged:
        run.length > 1
          ? { anchorId: anchor._id, periods: run.map((s) => s.period) }
          : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
