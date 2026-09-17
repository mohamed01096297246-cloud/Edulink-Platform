const Schedule = require("../models/Schedule");

// A teacher taking the same class for back-to-back periods — a double lesson —
// takes attendance once, not once per period, and it is filed on the LAST
// period of the run (the school's rule: "put them in the second period").
// The run counts as one even across the break; three in a row are still one.
//
// "Back to back" means consecutive period numbers for the same teacher,
// classroom, day AND subject. The subject has to match because the
// "مواظبة وسلوك" mark is an attendance rate computed per subject: folding a
// different subject's period into another's would silently move its
// attendance out of its own mark. (In the timetable as built, no run mixes
// subjects, so this only guards the future.)

// Groups one teacher's schedules into runs. Input may be plain objects or
// documents, with teacher/classroom/subject either ids or populated.
const idOf = (value) => String(value?._id || value || "");

const groupRuns = (schedules) => {
  const buckets = new Map();
  for (const s of schedules) {
    if (!s.period) continue;
    const key = [idOf(s.teacher), idOf(s.classroom), s.day, idOf(s.subject)].join("|");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(s);
  }

  const runs = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => a.period - b.period);
    let run = [list[0]];
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].period === run[run.length - 1].period + 1) {
        run.push(list[i]);
      } else {
        runs.push(run);
        run = [list[i]];
      }
    }
    runs.push(run);
  }
  return runs;
};

// The run a single schedule belongs to (just itself when it stands alone),
// ordered by period. The last element is where attendance is filed.
const runFor = async (schedule) => {
  if (!schedule?.period) return [schedule];

  const siblings = await Schedule.find({
    teacher: idOf(schedule.teacher),
    classroom: idOf(schedule.classroom),
    day: schedule.day,
    subject: idOf(schedule.subject),
  }).sort({ period: 1 });

  const run = groupRuns(siblings).find((r) =>
    r.some((s) => String(s._id) === String(schedule._id)),
  );
  return run || [schedule];
};

const anchorOf = (run) => run[run.length - 1];

module.exports = { groupRuns, runFor, anchorOf };
