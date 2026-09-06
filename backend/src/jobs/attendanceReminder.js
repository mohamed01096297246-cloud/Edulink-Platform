const Attendance = require("../models/Attendance");
const AttendanceReminder = require("../models/AttendanceReminder");
const Schedule = require("../models/Schedule");
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
  GRACE_MINUTES,
  zonedTimeToInstant,
  todayInZone,
  weekdayOf,
} = require("../utils/attendanceWindow");

// The bell has just rung and the register is still empty — warn the teacher
// while they can still do something about it, because 15 minutes later the
// sheet locks for good.

const SWEEP_MS = 60 * 1000;

// How far back a lesson may have ended and still trigger a reminder. Wider
// than the sweep interval so a slow tick or a redeploy in the wrong second
// doesn't drop the notice altogether; the unique index on AttendanceReminder
// stops the overlap from sending twice.
const LOOKBACK_MS = 3 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

const formatClock = (instant, timeZone) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);

const utcMidnight = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const remindForSchool = async (school, now) => {
  const timeZone = school.timezone || "Africa/Cairo";
  const dateStr = todayInZone(timeZone, now);
  const today = weekdayOf(dateStr);

  if (!today) return 0;

  const schedules = await Schedule.find({ school: school._id, day: today })
    .populate("teacher", "pushToken")
    .populate("subject", "name")
    .populate("classroom", "name");

  const justEnded = schedules.filter((schedule) => {
    const endsAt = zonedTimeToInstant(dateStr, schedule.endTime, timeZone);
    if (!endsAt) return false;

    const sinceBell = now.getTime() - endsAt.getTime();
    return sinceBell >= 0 && sinceBell < LOOKBACK_MS;
  });

  if (justEnded.length === 0) return 0;

  const date = utcMidnight(dateStr);
  let sent = 0;

  for (const schedule of justEnded) {
    // Nothing to chase if the register is already filed.
    // eslint-disable-next-line no-await-in-loop
    const recorded = await Attendance.exists({ schedule: schedule._id, date });
    if (recorded) continue;

    const token = schedule.teacher?.pushToken;
    if (!token) continue;

    // Claim the send before making it. A duplicate key here means another
    // instance got there first, which is exactly the outcome we want.
    try {
      // eslint-disable-next-line no-await-in-loop
      await AttendanceReminder.create({
        schedule: schedule._id,
        date,
        teacher: schedule.teacher._id,
        school: school._id,
      });
    } catch (err) {
      if (err?.code === 11000) continue;
      throw err;
    }

    const endsAt = zonedTimeToInstant(dateStr, schedule.endTime, timeZone);
    const closesAt = new Date(endsAt.getTime() + GRACE_MINUTES * 60 * 1000);

    const subject = schedule.subject?.name || "الحصة";
    const classroom = schedule.classroom?.name || "";

    // eslint-disable-next-line no-await-in-loop
    await sendPushNotifications(
      [token],
      `⏰ سجّل الحضور خلال ${GRACE_MINUTES} دقيقة`,
      `حصة ${subject}${classroom ? ` — ${classroom}` : ""} خلصت ولسه الحضور ` +
        `ما اتسجلش. السجل بيتقفل نهائيًا الساعة ${formatClock(closesAt, timeZone)}، ` +
        "وعدم التسجيل في الوقت بيعرّضك للمساءلة.",
      {
        type: "attendanceReminder",
        scheduleId: String(schedule._id),
        date: dateStr,
        closesAt: closesAt.toISOString(),
      },
    );

    sent += 1;
  }

  return sent;
};

const sweep = async () => {
  const now = new Date();
  const schools = await School.find({ active: true }).select("timezone").lean();

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
      `${GRACE_MINUTES}-minute grace)`,
  );

  return () => clearInterval(timer);
};

exports.sweepAttendanceReminders = sweep;
