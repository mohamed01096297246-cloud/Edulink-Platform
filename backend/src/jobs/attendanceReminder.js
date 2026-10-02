const Attendance = require("../models/Attendance");
const AttendanceReminder = require("../models/AttendanceReminder");
const Schedule = require("../models/Schedule");
const CoverSession = require("../models/CoverSession");
const School = require("../models/School");
// Required for their side effect: the sweep populates teacher/subject/
// classroom, and Mongoose throws if those models were never registered. The
// running server happens to load them through its routes, but this job also
// runs from scripts and tests where nothing else pulls them in.
require("../models/User");
require("../models/Subject");
require("../models/Classroom");
const { sendPushNotifications } = require("../utils/pushNotifications");
const {
  zonedTimeToInstant,
  todayInZone,
  weekdayOf,
  nextWeekStart,
} = require("../utils/attendanceWindow");
const { groupRuns, anchorOf } = require("../utils/consecutivePeriods");
const { clock, registerLesson } = require("../utils/dailyAttendance");

// The lesson has just ended and the register is still empty — a nudge while
// it is fresh. Nothing is urgent any more: the register stays open until the
// end of the week (see utils/attendanceWindow), so this is a reminder, not a
// countdown. A double lesson is one register, so it is nudged once, at the
// end of its last period.

const SWEEP_MS = 60 * 1000;

// How far back a lesson may have ended and still trigger a reminder. Wider
// than the sweep interval so a slow tick or a redeploy in the wrong second
// doesn't drop the notice altogether; the unique index on AttendanceReminder
// stops the overlap from sending twice.
const LOOKBACK_MS = 3 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

const utcMidnight = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

// The daily register (School.attendanceMode "daily"): an alarm to the
// first-period teacher of every class whose register is still empty
// ALARM_LEAD_MS before that first period ends. Rides the app's
// "attendance-alarm" channel, which rings with an alarm sound. The app also
// schedules the same alarm on the phone itself from the timetable
// (src/utils/attendanceAlarm.js in the app), so it rings even without a
// connection; this one knows whether the register was actually taken.
const ALARM_LEAD_MS = 10 * 60 * 1000;

const alarmForSchool = async (school, now, dateStr, today, date) => {
  const timeZone = school.timezone || "Africa/Cairo";
  const lessons = await Schedule.find({ school: school._id, day: today })
    .populate("teacher", "pushToken")
    .populate("subject", "name")
    .populate("classroom", "name")
    .sort({ period: 1, startTime: 1 });

  // Each class's register lesson: its first lesson with a teacher (see
  // utils/dailyAttendance.registerLesson — a طابور or نشاط period with no
  // teacher can open the day, but the alarm belongs to whoever takes the
  // register).
  const byClass = new Map();
  for (const lesson of lessons) {
    const key = String(lesson.classroom?._id || lesson.classroom);
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(lesson);
  }
  const firstOf = new Map();
  for (const [key, classLessons] of byClass) {
    const first = registerLesson(classLessons);
    if (first) firstOf.set(key, first);
  }

  let sent = 0;
  for (const [classroomId, first] of firstOf) {
    const endsAt = zonedTimeToInstant(dateStr, first.endTime, timeZone);
    if (!endsAt) continue;
    const sinceAlarm = now.getTime() - (endsAt.getTime() - ALARM_LEAD_MS);
    if (sinceAlarm < 0 || sinceAlarm >= LOOKBACK_MS) continue;

    const classLessons = lessons.filter((l) => String(l.classroom?._id || l.classroom) === classroomId);
    // eslint-disable-next-line no-await-in-loop
    const taken = await Attendance.exists({ schedule: { $in: classLessons.map((l) => l._id) }, date });
    if (taken) continue;

    const token = first.teacher?.pushToken;
    if (!token) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await AttendanceReminder.create({
        session: first._id,
        kind: "DailyAlarm",
        date,
        teacher: first.teacher._id,
        school: school._id,
      });
    } catch (err) {
      if (err?.code === 11000) continue;
      throw err;
    }

    // eslint-disable-next-line no-await-in-loop
    await sendPushNotifications(
      [token],
      "🚨 لازم تاخد الغياب حالاً",
      `الحصة الأولى في ${first.classroom?.name || "الفصل"} قربت تخلص ولسه الغياب ما اتاخدش. ` +
        "يجب أخذ الغياب حالاً وإلا تعرضت للمساءلة الإدارية.",
      { type: "attendanceAlarm", scheduleId: String(first._id), date: dateStr },
      { channelId: "attendance-alarm", sound: "alarm.wav", priority: "high" },
    );
    sent += 1;
  }
  return sent;
};

const remindForSchool = async (school, now) => {
  const timeZone = school.timezone || "Africa/Cairo";
  const dateStr = todayInZone(timeZone, now);
  const today = weekdayOf(dateStr);

  if (!today) return 0;

  const date = utcMidnight(dateStr);

  // A daily-register school has no per-lesson registers to chase — only
  // the first period's, and that one gets the alarm instead.
  if (school.attendanceMode === "daily") {
    return alarmForSchool(school, now, dateStr, today, date);
  }

  // A cover lesson closes on the same rule as a timetabled one, so it is
  // chased the same way. Both are reduced to the shape this sweep needs.
  const [schedules, coverSessions] = await Promise.all([
    Schedule.find({ school: school._id, day: today })
      .populate("teacher", "pushToken")
      .populate("subject", "name")
      .populate("classroom", "name"),
    CoverSession.find({ school: school._id, date })
      .populate("teacher", "pushToken")
      .populate("classroom", "name"),
  ]);

  // Only the last period of each double lesson carries a register.
  const runs = groupRuns(schedules);
  const loose = schedules.filter((s) => !s.period);

  const candidates = [
    ...runs.map((run) => ({ session: anchorOf(run), isCover: false, run })),
    ...loose.map((s) => ({ session: s, isCover: false, run: [s] })),
    ...coverSessions.map((s) => ({ session: s, isCover: true })),
  ];

  const justEnded = candidates.filter(({ session }) => {
    const endsAt = zonedTimeToInstant(dateStr, session.endTime, timeZone);
    if (!endsAt) return false;

    const sinceBell = now.getTime() - endsAt.getTime();
    return sinceBell >= 0 && sinceBell < LOOKBACK_MS;
  });

  if (justEnded.length === 0) return 0;

  let sent = 0;

  for (const { session: schedule, isCover, run } of justEnded) {
    // Nothing to chase if the register is already filed.
    // eslint-disable-next-line no-await-in-loop
    const recorded = await Attendance.exists(
      isCover
        ? { coverSession: schedule._id }
        : { schedule: { $in: (run || [schedule]).map((s) => s._id) }, date },
    );
    if (recorded) continue;

    const token = schedule.teacher?.pushToken;
    if (!token) continue;

    // Claim the send before making it. A duplicate key here means another
    // instance got there first, which is exactly the outcome we want.
    try {
      // eslint-disable-next-line no-await-in-loop
      await AttendanceReminder.create({
        session: schedule._id,
        kind: isCover ? "CoverSession" : "Schedule",
        date,
        teacher: schedule.teacher._id,
        school: school._id,
      });
    } catch (err) {
      if (err?.code === 11000) continue;
      throw err;
    }

    const closesAt = zonedTimeToInstant(nextWeekStart(dateStr), "00:00", timeZone);

    const label = isCover ? "حصة احتياط" : `حصة ${schedule.subject?.name || ""}`.trim();
    const classroom = schedule.classroom?.name || "";

    // eslint-disable-next-line no-await-in-loop
    await sendPushNotifications(
      [token],
      "📝 الحضور لسه ما اتسجلش",
      `${label}${classroom ? ` — ${classroom}` : ""} خلصت. ` +
        "تقدر تسجل الحضور في أي وقت لحد آخر يوم السبت.",
      {
        type: "attendanceReminder",
        ...(isCover
          ? { coverSessionId: String(schedule._id) }
          : { scheduleId: String(schedule._id) }),
        date: dateStr,
        closesAt: closesAt.toISOString(),
      },
    );

    sent += 1;
  }

  return sent;
};

const sweep = async () => {
  const now = clock.now();
  const schools = await School.find({ active: true }).select("timezone attendanceMode").lean();

  let sent = 0;
  for (const school of schools) {
    // eslint-disable-next-line no-await-in-loop
    sent += await remindForSchool(school, now);
  }

  if (sent > 0) {
    console.log(`[attendanceReminder] sent ${sent} reminder(s)`);
  }
};

// Returns a stop function so the server can clear it on shutdown.
exports.startAttendanceReminders = () => {
  const tick = () => {
    sweep().catch((err) =>
      // A failed sweep must never take the server down — the next minute
      // will try again.
      console.error("[attendanceReminder] sweep failed:", err.message),
    );
  };

  const timer = setInterval(tick, SWEEP_MS);

  // Do not hold the process open on its own account during shutdown.
  timer.unref();

  console.log(
    `⏰ Attendance reminders running (every ${SWEEP_MS / 1000}s, ` +
      "register open until end of week)",
  );

  return () => clearInterval(timer);
};

exports.sweepAttendanceReminders = sweep;
