// «غ» — the pupil was away when the mark was taken. On paper the register
// writes غ in the box, and it counts as a zero: the week's total, the month's
// average and أعمال السنة all add it up as 0. Here it is stored the same way,
// as a mark of 0 with `absent` set beside it, so every sum and average stays
// exactly as it was, and only what is shown — the parent's and the student's
// screens, the printed register — reads «غ» instead of 0, so a parent sees
// that their child was absent, not that they scored nothing.
//
// «م» — منقطع: the pupil has stopped coming, and the box has no mark at all
// (Mohamed, 2026-11-05). It is stored the same way as غ, a 0 with `withdrawn`
// beside it, so an app from before it shows and saves back a plain 0 and
// loses nothing; but nothing counts it. A week whose every mark is م has no
// total, and the month's average is taken over the pupil's other weeks
// (utils/weekScores.js monthAverage); a test that is م adds nothing to the
// term (utils/term40.js). It reads «م» wherever غ reads غ.
//
// Either flag is honoured only while the mark is still 0: a mark changed
// afterwards to anything else is a real mark, whatever is left beside it.

const ABSENT = "غ";
const WITHDRAWN = "م";

// What may be typed for each: the letter alone, or the word.
const ABSENT_WORDS = new Set(["غ", "غ.", "غائب", "غايب", "غياب"]);
const WITHDRAWN_WORDS = new Set(["م", "م.", "منقطع", "منقطعة"]);
const isAbsentText = (value) => typeof value === "string" && ABSENT_WORDS.has(value.trim());
const isWithdrawnText = (value) => typeof value === "string" && WITHDRAWN_WORDS.has(value.trim());

// A stored mark and its flag → whether it reads «غ» / «م».
const isAbsent = (flag, score) => Boolean(flag) && Number(score) === 0;
const isWithdrawn = (flag, score) => Boolean(flag) && Number(score) === 0;

// The weekly coursework override keeps one flag of each per column it holds.
const OVERRIDE_FLAG = { homeworkScore: "homeworkAbsent", attendanceScore: "attendanceAbsent" };
const OVERRIDE_WITHDRAWN = { homeworkScore: "homeworkWithdrawn", attendanceScore: "attendanceWithdrawn" };

// Arabic-Indic and Persian digits, and the Arabic decimal comma, to plain ones.
const toLatin = (value) =>
  typeof value === "string"
    ? value
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/[٫،,]/g, ".")
        .trim()
    : value;

// A mark as sent: any number from 0 to the column's maximum — whatever the
// paper says, 8.3 as well as 8.5 (Mohamed, 2026-10-28) — «غ», «م», or
// nothing (null: clear it). → { value, absent, withdrawn } or { error }.
const readMark = (raw, max) => {
  if (isAbsentText(raw)) return { value: 0, absent: true, withdrawn: false };
  if (isWithdrawnText(raw)) return { value: 0, absent: false, withdrawn: true };
  const text = toLatin(raw);
  if (text === null || text === undefined || text === "") return { value: null };
  const n = Number(text);
  if (typeof text === "boolean" || !Number.isFinite(n) || n < 0 || n > max) return { error: true };
  return { value: Math.round(n * 100) / 100, absent: false, withdrawn: false };
};

// The flags a saved mark leaves beside it, as { set, unset } under the names
// given. A number takes both off — except a 0 from an app that can't send a
// letter (`letters` false): that app shows a غ or م pupil as 0 and saves the 0
// back unchanged, so the flag stays.
const markFlags = (mark, { letters = true, absent = "absent", withdrawn = "withdrawn" } = {}) => {
  if (mark.absent) return { set: { [absent]: true }, unset: { [withdrawn]: "" } };
  if (mark.withdrawn) return { set: { [withdrawn]: true }, unset: { [absent]: "" } };
  if (mark.value === 0 && !letters) return { set: {}, unset: {} };
  return { set: {}, unset: { [absent]: "", [withdrawn]: "" } };
};

// An update for a mark kept in a document of its own (التقييم الأسبوعي،
// كراسة الحصة، a test): the number under `field`, its flags, and `extra`.
const markUpdate = (field, mark, extra = {}, letters = true) => {
  const { set, unset } = markFlags(mark, { letters });
  return {
    $set: { [field]: mark.value, ...extra, ...set },
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
};

// How a stored mark is shown on a sheet: the number, غ or م.
const shownMark = (value, absent, withdrawn) =>
  withdrawn ? WITHDRAWN : absent ? ABSENT : value ?? null;

module.exports = {
  ABSENT,
  WITHDRAWN,
  isAbsentText,
  isWithdrawnText,
  isAbsent,
  isWithdrawn,
  OVERRIDE_FLAG,
  OVERRIDE_WITHDRAWN,
  readMark,
  markFlags,
  markUpdate,
  shownMark,
};
