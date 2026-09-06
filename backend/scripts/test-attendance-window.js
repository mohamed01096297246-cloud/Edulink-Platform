// Guards the attendance-window maths against the bug it was written to kill:
// the server runs in UTC while lesson times are Cairo wall-clock, so a naive
// comparison drifts by two hours in winter and three in summer.
//
//   node scripts/test-attendance-window.js
process.env.TZ = "UTC"; // mimic the DigitalOcean container
const { getAttendanceWindow, zonedTimeToInstant, todayInZone, weekdayOf } =
  require("../src/utils/attendanceWindow");

const TZ = "Africa/Cairo";
let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      got  ${got}\n      want ${want}`);
};

// Egypt observes DST (Apr–Oct) since 2023: +03 in summer, +02 in winter.
check("summer 10:00 Cairo -> UTC",
  zonedTimeToInstant("2026-09-06", "10:00", TZ).toISOString(), "2026-09-06T07:00:00.000Z");
check("winter 10:00 Cairo -> UTC",
  zonedTimeToInstant("2026-01-15", "10:00", TZ).toISOString(), "2026-01-15T08:00:00.000Z");

check("weekdayOf 2026-09-06", weekdayOf("2026-09-06"), "sun");
check("todayInZone shape", /^\d{4}-\d{2}-\d{2}$/.test(todayInZone(TZ)), true);

// Session: Sunday 2026-09-06, 10:00-10:50 Cairo  => 07:00-07:50 UTC
// grace closes 08:05 UTC
const schedule = { day: "sun", startTime: "10:00", endTime: "10:50" };
const at = (iso) =>
  getAttendanceWindow({ schedule, dateStr: "2026-09-06", timeZone: TZ, now: new Date(iso) });

check("before the bell",        at("2026-09-06T06:59:00Z").state, "upcoming");
check("first minute of class",  at("2026-09-06T07:00:30Z").state, "open");
check("mid class",              at("2026-09-06T07:30:00Z").state, "open");
check("on the final bell",      at("2026-09-06T07:50:00Z").state, "open");
check("one minute after bell",  at("2026-09-06T07:51:00Z").state, "grace");
check("14 min after bell",      at("2026-09-06T08:04:00Z").state, "grace");
check("exactly 15 min after",   at("2026-09-06T08:05:00Z").state, "grace");
check("15 min + 1 sec after",   at("2026-09-06T08:05:01Z").state, "closed");
check("next day, same time",    at("2026-09-07T07:30:00Z").state, "closed");

check("canRecord during grace", at("2026-09-06T08:00:00Z").canRecord, true);
check("canRecord once closed",  at("2026-09-06T09:00:00Z").canRecord, false);
check("countdown at 5 min left",
  Math.round(at("2026-09-06T08:00:00Z").msRemaining / 60000), 5);

// A Monday date against a Sunday session must not be recordable at all.
check("wrong weekday",
  getAttendanceWindow({ schedule, dateStr: "2026-09-07", timeZone: TZ,
    now: new Date("2026-09-07T07:30:00Z") }).state, "wrong-day");

// Winter session, to prove the DST switch is followed.
check("winter class window",
  getAttendanceWindow({ schedule: { day: "thu", startTime: "10:00", endTime: "10:50" },
    dateStr: "2026-01-15", timeZone: TZ, now: new Date("2026-01-15T09:00:00Z") }).state, "grace");

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
