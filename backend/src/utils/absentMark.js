// «غ» — the pupil was away when the mark was taken. On paper the register
// writes غ in the box, and it counts as a zero: the week's total, the month's
// average and أعمال السنة all add it up as 0. Here it is stored the same way,
// as a mark of 0 with `absent` set beside it, so every sum and average stays
// exactly as it was, and only what is shown — the parent's and the student's
// screens, the printed register — reads «غ» instead of 0, so a parent sees
// that their child was absent, not that they scored nothing.
//
// The flag is honoured only while the mark is still 0: a mark changed
// afterwards to anything else is a real mark, whatever is left beside it.

const ABSENT = "غ";

// What may be typed for it: غ alone, or the word.
const ABSENT_WORDS = new Set(["غ", "غ.", "غائب", "غايب", "غياب"]);
const isAbsentText = (value) => typeof value === "string" && ABSENT_WORDS.has(value.trim());

// A stored mark and its flag → whether it reads «غ».
const isAbsent = (flag, score) => Boolean(flag) && Number(score) === 0;

// The weekly coursework override keeps one flag per column it holds.
const OVERRIDE_FLAG = { homeworkScore: "homeworkAbsent", attendanceScore: "attendanceAbsent" };

module.exports = { ABSENT, isAbsentText, isAbsent, OVERRIDE_FLAG };
