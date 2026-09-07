const CoverSession = require("../models/CoverSession");
const Attendance = require("../models/Attendance");
const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const School = require("../models/School");
const {
  getAttendanceWindow,
  todayInZone,
  weekdayOf,
} = require("../utils/attendanceWindow");

// A cover lesson is one period long. The teacher starts it when they walk in,
// so there is no timetable to read a duration from.
const COVER_MINUTES = 50;

const pad = (n) => String(n).padStart(2, "0");

const schoolTimezone = async (schoolId) => {
  if (!schoolId) return "Africa/Cairo";
  const school = await School.findById(schoolId).select("timezone").lean();
  return school?.timezone || "Africa/Cairo";
};

// School-local wall clock right now, as minutes past midnight.
const minutesNowInZone = (timeZone, now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return Number(parts.hour) * 60 + Number(parts.minute);
};

const hhmm = (totalMinutes) => {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
};

const utcMidnight = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const withWindow = (session, timeZone) => ({
  _id: session._id,
  classroom: session.classroom,
  grade: session.grade,
  date: session.date,
  startTime: session.startTime,
  endTime: session.endTime,
  window: getAttendanceWindow({
    schedule: session,
    dateStr: session.date.toISOString().slice(0, 10),
    timeZone,
  }),
});

// Starts a cover lesson for a classroom the teacher does not normally teach.
// The date is always today — a cover lesson is something you are standing in
// for right now, never something you file for last Tuesday.
exports.startCoverSession = async (req, res) => {
  try {
    const { classroomId } = req.body;

    if (!classroomId) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الفصل الأول." });
    }

    const classroom = await Classroom.findById(classroomId).populate(
      "grade",
      "name",
    );

    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    // A teacher covers inside their own school only — the classroom picker is
    // school-wide precisely because cover crosses grades, so this is the one
    // boundary left to enforce.
    if (String(classroom.school) !== String(req.user.school)) {
      return res
        .status(403)
        .json({ success: false, message: "الفصل ده مش في مدرستك." });
    }

    const timeZone = await schoolTimezone(req.user.school);
    const now = new Date();
    const dateStr = todayInZone(timeZone, now);
    const date = utcMidnight(dateStr);

    const startMinutes = minutesNowInZone(timeZone, now);

    // Re-use a session the teacher already has running for this class rather
    // than opening a second one — a double tap must not create two registers
    // for the same room, nor restart the clock they are racing.
    const running = await CoverSession.find({
      teacher: req.user.id,
      classroom: classroomId,
      date,
    })
      .populate("classroom", "name")
      .populate("grade", "name");

    const live = running.find(
      (session) =>
        getAttendanceWindow({
          schedule: session,
          dateStr,
          timeZone,
        }).canRecord,
    );

    if (live) {
      return res.status(200).json({
        success: true,
        resumed: true,
        message: "عندك حصة احتياط شغالة بالفعل للفصل ده.",
        data: withWindow(live, timeZone),
      });
    }

    const created = await CoverSession.create({
      teacher: req.user.id,
      classroom: classroomId,
      grade: classroom.grade?._id || classroom.grade,
      school: req.user.school,
      date,
      day: weekdayOf(dateStr),
      startTime: hhmm(startMinutes),
      endTime: hhmm(startMinutes + COVER_MINUTES),
    });

    // Populated before returning so the app can name the class it is about to
    // show a register for, without a second round trip.
    const session = await CoverSession.findById(created._id)
      .populate("classroom", "name")
      .populate("grade", "name");

    return res.status(201).json({
      success: true,
      resumed: false,
      message: `بدأت حصة احتياط لمدة ${COVER_MINUTES} دقيقة.`,
      data: withWindow(session, timeZone),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// The teacher's cover lessons for today, newest first — so re-opening the
// screen picks up a session already in progress instead of starting another.
exports.getMyCoverSessions = async (req, res) => {
  try {
    const timeZone = await schoolTimezone(req.user.school);
    const dateStr = todayInZone(timeZone);

    const sessions = await CoverSession.find({
      teacher: req.user.id,
      date: utcMidnight(dateStr),
    })
      .populate("classroom", "name")
      .populate("grade", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: sessions.map((session) => withWindow(session, timeZone)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Roster plus recording window for one cover session, mirroring what the
// timetabled attendance screen gets from /attendance/check.
exports.getCoverSessionRoster = async (req, res) => {
  try {
    const session = await CoverSession.findById(req.params.id)
      .populate("classroom", "name")
      .populate("grade", "name");

    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "حصة الاحتياط غير موجودة." });
    }

    if (String(session.teacher) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "حصة الاحتياط دي مش بتاعتك.",
      });
    }

    const timeZone = await schoolTimezone(req.user.school);

    const [students, records] = await Promise.all([
      Student.find({ classroom: session.classroom._id, active: true })
        .select("firstName lastName gender")
        .sort({ firstName: 1 }),
      Attendance.find({ coverSession: session._id }).populate(
        "student",
        "firstName lastName",
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        session: withWindow(session, timeZone),
        students,
        records,
        exists: records.length > 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.COVER_MINUTES = COVER_MINUTES;
