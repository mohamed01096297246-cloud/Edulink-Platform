// A homework may be set with a mark ("من 10") or without one — a teacher who
// only checks whether it was done. Everything that turns homework into a
// score reads it through here, so the two kinds add up the same way
// everywhere:
//   with a mark    — the student earns the score recorded, out of the mark;
//   without a mark — handing it in earns the one point it is worth,
//                    missing it earns nothing.
// Either way a missing homework is zero, and the week's homework column is
// earned ÷ worth, scaled to the scheme's maximum (utils/weekScores.js).

const hasMarks = (homework) => Number(homework?.totalMarks) > 0;

const worthOf = (homework) => (hasMarks(homework) ? Number(homework.totalMarks) : 1);

const earnedOn = (result, homework) => {
  if (!result || result.status === "missing") return 0;
  return hasMarks(homework) ? Number(result.score) || 0 : 1;
};

// Normalises what a form sends for "الدرجة الكلية": blank, 0 or nothing
// means the homework has no mark.
const marksFromInput = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

module.exports = { hasMarks, worthOf, earnedOn, marksFromInput };
