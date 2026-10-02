const Schedule = require("../models/Schedule");
const BellSchedule = require("../models/BellSchedule");
const Attendance = require("../models/Attendance");
const Classroom = require("../models/Classroom");
const School = require("../models/School");
const { findBellFor } = require("./periods");
const { zonedTimeToInstant, weekdayOf } = require("./attendanceWindow");

// The daily register (School.attendanceMode "daily"): a class's attendance
// is taken once a day, in its first period, and filed against that first
// lesson. Every later teacher of the class that day sees it, and may add
// students who have since gone missing — until the school day ends. After
// that the day's register is final; nobody changes it.

// "Now", behind one seam, so the time-bound rules here (and the alarm in
// jobs/attendanceReminder.js) can be exercised at any moment of a school day.
const clock = { now: () => new Date() };

const isDailyMode = async (schoolId) => {
  if (!schoolId) return false;
  const school = await School.findById(schoolId).select("attendanceMode").lean();
  return school?.attendanceMode === "daily";
};

const utcMidnight = (dateStr) => {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// The lesson a class's day's register lives in: its first lesson that has a
// teacher. A period with no teacher (طابور, نشاط) can open the day on the
// timetable, but nobody could take a register in it — so the register
// moves to the first lesson someone actually teaches. Every place that asks
// "which is the first lesson" (the register, the server's alarm, the
// phone's alarm) goes through here, so they can never disagree.
//
// Takes lessons already in period order. Works on populated or raw ids.
const registerLesson = (lessons) => lessons.find((lesson) => lesson.teacher) || null;

// A class's lessons on a weekday, in period order, and the one its day's
// register lives in.
const classroomDay = async (classroomId, day) => {
  const lessons = await Schedule.find({ classroom: classroomId, day })
    .populate("teacher", "firstName lastName pushToken")
    .populate("subject", "name")
    .sort({ period: 1, startTime: 1 });
  return { lessons, first: registerLesson(lessons) };
};

// When the class's school day ends: the last period of its bell that day,
// or — with no bell — the end of its last lesson.
const dayEndTime = async (classroom, day, lessons) => {
  const bells = await BellSchedule.find({ school: classroom.school }).lean();
  const bell = findBellFor(bells, classroom.grade, day);
  const times = [
    ...(bell?.periods || []).map((p) => p.endTime),
    ...lessons.map((l) => l.endTime),
  ].filter(Boolean);
  return times.length ? times.sort().at(-1) : null;
};

// The day's register for a class: every record filed against any of its
// lessons that day (it is filed on the first, but a register taken before
// the school switched to daily mode may sit on another).
const dailyRecords = (lessons, dateStr) =>
  Attendance.find({
    schedule: { $in: lessons.map((l) => l._id) },
    date: utcMidnight(dateStr),
  }).populate("student", "firstName lastName");

// Same shape as getAttendanceWindow (utils/attendanceWindow.js), so the app
// renders it the same way — only the closing time differs: the end of the
// school day instead of the end of the week.
const dailyWindow = ({ dateStr, day, endTime, timeZone, now = clock.now() }) => {
  const base = {
    serverTime: now.toISOString(),
    opensAt: null,
    endsAt: null,
    closesAt: null,
    msRemaining: 0,
    canRecord: false,
    daily: true,
  };
  if (!dateStr || weekdayOf(dateStr) !== day || !endTime) return { ...base, state: "wrong-day" };

  const opensAt = zonedTimeToInstant(dateStr, "00:00", timeZone);
  const closesAt = zonedTimeToInstant(dateStr, endTime, timeZone);
  const window = {
    ...base,
    opensAt: opensAt.toISOString(),
    endsAt: closesAt.toISOString(),
    closesAt: closesAt.toISOString(),
  };
  if (now < opensAt) return { ...window, state: "upcoming" };
  if (now >= closesAt) return { ...window, state: "closed" };
  return { ...window, state: "open", msRemaining: closesAt - now, canRecord: true };
};

const DAILY_MESSAGES = {
  closed: "اليوم الدراسي خلص — الغياب اتقفل ومينفعش يتعدّل بعد نهاية اليوم.",
  upcoming: "اليوم ده لسه ما جاش.",
  "wrong-day": "الفصل مالوش حصص في اليوم ده.",
};

// Everything a screen needs about one class's register on one date.
const dailyState = async ({ classroomId, dateStr, timeZone, now = clock.now() }) => {
  const classroom = await Classroom.findById(classroomId).select("name grade school");
  const day = weekdayOf(dateStr);
  const { lessons, first } = await classroomDay(classroomId, day);
  const endTime = classroom ? await dayEndTime(classroom, day, lessons) : null;
  const records = lessons.length ? await dailyRecords(lessons, dateStr) : [];
  const window = dailyWindow({ dateStr, day, endTime, timeZone, now });

  return {
    classroom,
    lessons,
    first,
    records,
    window,
    taken: records.length > 0,
    absentees: records
      .filter((r) => r.status === "absent")
      .map((r) => ({
        student: r.student?._id || r.student,
        name: r.student ? `${r.student.firstName} ${r.student.lastName}` : "",
        excused: r.excused === true,
        added: Boolean(r.addedBy),
      })),
  };
};

module.exports = {
  clock,
  isDailyMode,
  utcMidnight,
  registerLesson,
  classroomDay,
  dayEndTime,
  dailyRecords,
  dailyWindow,
  dailyState,
  DAILY_MESSAGES,
};
