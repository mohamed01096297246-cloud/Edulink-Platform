// When a teacher is allowed to record attendance for a given session.
//
// A session's startTime/endTime are wall-clock strings ("10:00") in the
// school's own timezone, but the server runs in UTC. Comparing them against
// `new Date().getHours()` — as this codebase used to — is off by the whole UTC
// offset, which in Cairo means the window opens and shuts two or three hours
// away from the actual lesson. Everything here therefore converts the school's
// wall clock to a real instant before comparing.

// How long after the bell a teacher still has to file the register.
const GRACE_MINUTES = 15;

// The window is only meaningful for the weekday the session actually runs on.
const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const pad = (n) => String(n).padStart(2, "0");

// Milliseconds that must be added to a UTC instant to read it as local time in
// `timeZone`. Derived from Intl rather than hard-coded, so Egypt's summer time
// (and any other school's rules) are handled without a lookup table.
const zoneOffsetMs = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl can render midnight as "24" in some locales/engines.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtc - instant.getTime();
};

// The instant at which `HH:MM` on `YYYY-MM-DD` occurs in `timeZone`.
const zonedTimeToInstant = (dateStr, timeStr, timeZone) => {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const [hour, minute] = String(timeStr).split(":").map(Number);

  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) {
    return null;
  }

  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Subtracting the offset at the naive guess lands within an hour of the
  // answer; re-reading the offset there fixes the two days a year when a DST
  // change falls between the guess and the result.
  const firstPass = naive - zoneOffsetMs(new Date(naive), timeZone);
  const settled = naive - zoneOffsetMs(new Date(firstPass), timeZone);

  return new Date(settled);
};

// Today's date in the school's timezone, as YYYY-MM-DD.
const todayInZone = (timeZone, now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return parts; // en-CA formats as YYYY-MM-DD
};

// Which weekday `YYYY-MM-DD` falls on, as one of DAY_CODES. The date is a
// plain calendar date with no timezone of its own, so it is read as UTC to
// avoid the server's own zone shifting it across midnight.
const weekdayOf = (dateStr) => {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return Number.isNaN(date.getTime()) ? null : DAY_CODES[date.getUTCDay()];
};

/**
 * Describes whether attendance can be filed for `schedule` on `dateStr`.
 *
 * state:
 *   "wrong-day" — the session does not run on that weekday at all
 *   "upcoming"  — the lesson has not started yet
 *   "open"      — the lesson is in progress
 *   "grace"     — the lesson ended; the 15-minute countdown is running
 *   "closed"    — the countdown expired; permanently locked
 */
const getAttendanceWindow = ({
  schedule,
  dateStr,
  timeZone = "Africa/Cairo",
  now = new Date(),
}) => {
  const base = {
    graceMinutes: GRACE_MINUTES,
    serverTime: now.toISOString(),
    opensAt: null,
    endsAt: null,
    closesAt: null,
    msRemaining: 0,
    canRecord: false,
  };

  if (!schedule || !dateStr) {
    return { ...base, state: "closed" };
  }

  if (weekdayOf(dateStr) !== schedule.day) {
    return { ...base, state: "wrong-day" };
  }

  const opensAt = zonedTimeToInstant(dateStr, schedule.startTime, timeZone);
  const endsAt = zonedTimeToInstant(dateStr, schedule.endTime, timeZone);

  if (!opensAt || !endsAt) {
    return { ...base, state: "closed" };
  }

  const closesAt = new Date(endsAt.getTime() + GRACE_MINUTES * 60 * 1000);

  const window = {
    ...base,
    opensAt: opensAt.toISOString(),
    endsAt: endsAt.toISOString(),
    closesAt: closesAt.toISOString(),
  };

  if (now < opensAt) {
    return { ...window, state: "upcoming" };
  }

  if (now > closesAt) {
    return { ...window, state: "closed" };
  }

  return {
    ...window,
    state: now <= endsAt ? "open" : "grace",
    msRemaining: closesAt.getTime() - now.getTime(),
    canRecord: true,
  };
};

// Reasons refused, phrased for the teacher rather than the developer.
const WINDOW_MESSAGES = {
  "wrong-day": "الحصة دي مش موجودة في اليوم ده في جدولك.",
  upcoming: "الحصة لسه ما بدأتش — التسجيل بيفتح مع بداية الحصة.",
  closed:
    `انتهت مهلة تسجيل الحضور لهذه الحصة (${GRACE_MINUTES} دقيقة بعد نهايتها) ` +
    "والسجل اتقفل نهائيًا. لو في ظرف اضطرك تتأخر، كلّم إدارة المدرسة.",
};

module.exports = {
  GRACE_MINUTES,
  getAttendanceWindow,
  zonedTimeToInstant,
  todayInZone,
  weekdayOf,
  WINDOW_MESSAGES,
  pad,
};
