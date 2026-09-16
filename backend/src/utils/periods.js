// Period times come from the school's bell schedules (models/BellSchedule),
// looked up by the classroom's grade and the day — never typed by the admin
// and never taken from a request. There is no formula: the school's hours
// differ by grade AND by day, periods aren't all the same length, and there
// are short changeovers after the breaks, so the bell schedule is the one
// source of truth and everything here just reads it.

const PERIOD_NAMES = [
  "", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة",
  "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة",
];

const DAY_NAMES = { sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس" };

const periodLabel = (period) => `الحصة ${PERIOD_NAMES[period] || period}`;

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

// Strict inequality on purpose: a period ending 08:50 and the next starting
// 08:50 do not overlap, which is exactly what lets a teacher take two
// periods in a row.
const timesOverlap = (a, b) =>
  toMinutes(a.startTime) < toMinutes(b.endTime) &&
  toMinutes(a.endTime) > toMinutes(b.startTime);

const covers = (bell, gradeId, day) =>
  (bell.grades || []).some((g) => String(g._id || g) === String(gradeId)) &&
  (bell.days || []).includes(day);

const findBellFor = (bells, gradeId, day) => bells.find((b) => covers(b, gradeId, day)) || null;

const slotFor = (bell, period) =>
  (bell?.periods || []).find((p) => p.period === Number(period)) || null;

// Structural checks on one bell schedule, before it is compared against the
// others or against the timetable. Returns an Arabic message, or null.
const validateBellShape = ({ name, grades, days, periods, breaks }) => {
  if (!name || !String(name).trim()) return "اكتب اسم لمجموعة المواعيد.";
  if (!Array.isArray(grades) || grades.length === 0) return "اختار مرحلة واحدة على الأقل.";
  if (!Array.isArray(days) || days.length === 0) return "اختار يوم واحد على الأقل.";
  if (!Array.isArray(periods) || periods.length === 0) return "أضف حصة واحدة على الأقل.";

  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const seen = new Set();

  for (const p of periods) {
    const n = Number(p.period);
    if (!Number.isInteger(n) || n < 1 || n > 12) return "رقم الحصة لازم يكون من 1 لـ 12.";
    if (seen.has(n)) return `${periodLabel(n)} متكررة.`;
    seen.add(n);
    if (!hhmm.test(p.startTime) || !hhmm.test(p.endTime)) return `${periodLabel(n)}: اكتب الوقت كامل.`;
    if (toMinutes(p.endTime) <= toMinutes(p.startTime)) return `${periodLabel(n)}: وقت النهاية لازم يكون بعد البداية.`;
  }

  const sorted = [...periods].sort((a, b) => a.period - b.period);
  for (let i = 1; i < sorted.length; i += 1) {
    if (toMinutes(sorted[i].startTime) < toMinutes(sorted[i - 1].endTime)) {
      return `${periodLabel(sorted[i].period)} بتبدأ قبل ما ${periodLabel(sorted[i - 1].period)} تخلص.`;
    }
  }

  for (const b of breaks || []) {
    if (!hhmm.test(b.startTime) || !hhmm.test(b.endTime)) return "الفسحة: اكتب الوقت كامل.";
    if (toMinutes(b.endTime) <= toMinutes(b.startTime)) return "الفسحة: وقت النهاية لازم يكون بعد البداية.";
    const clash = sorted.find((p) => timesOverlap(p, b));
    if (clash) return `الفسحة (${b.startTime}–${b.endTime}) متداخلة مع ${periodLabel(clash.period)}.`;
  }

  return null;
};

// Works out what the whole school's timetable looks like under a given set
// of bell schedules, without writing anything: which stored periods need
// new times, which would be left with no period at that time (e.g. a 7th
// period on a day that now only has six), and which teachers would end up
// double-booked. Callers apply `ops` only if the plan is clean.
const planRetime = ({ schedules, classroomGrade, bells }) => {
  const ops = [];
  const orphans = [];
  const next = [];

  for (const s of schedules) {
    if (!s.period) continue; // legacy free-typed slot, nothing to derive from
    const gradeId = classroomGrade.get(String(s.classroom));
    const bell = findBellFor(bells, gradeId, s.day);
    const slot = slotFor(bell, s.period);

    if (!slot) {
      orphans.push(s);
      continue;
    }
    if (slot.startTime !== s.startTime || slot.endTime !== s.endTime) {
      ops.push({
        updateOne: { filter: { _id: s._id }, update: { $set: { startTime: slot.startTime, endTime: slot.endTime } } },
      });
    }
    next.push({ ...s, startTime: slot.startTime, endTime: slot.endTime });
  }

  const teacherClashes = [];
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i];
      const b = next[j];
      if (String(a.teacher) === String(b.teacher) && a.day === b.day && timesOverlap(a, b)) {
        teacherClashes.push([a, b]);
      }
    }
  }

  return { ops, orphans, teacherClashes };
};

module.exports = {
  PERIOD_NAMES,
  DAY_NAMES,
  periodLabel,
  timesOverlap,
  findBellFor,
  slotFor,
  validateBellShape,
  planRetime,
};
