// The subjects added up into a pupil's total (المجموع): the five the
// ministry counts — Arabic, English, Math, Science and Social Studies —
// under whatever name each school gives them (لغة عربيه، انجليزي حكومي،
// Math / رياضيات، Science / علوم، دراسات / درسات). Everything else is
// outside it: دين، القرآن، تربية فنية / رياضية، حاسب آلي، الموسيقى،
// المكتبة، a «مادة ثانية» (فرنسي / ألماني) and the like (Future's monthly
// certificate, 2026-10-27). The student's «أدائي» shows these alone.

// Names are compared loosely: diacritics, hamza forms, ة/ه, ى/ي, spaces and
// a leading «ال» don't matter, nor English letter case.
const normalize = (name) =>
  String(name || "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ء/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^ال/, ""))
    .join("");

const IN_TOTAL = [/عربي/, /arabic/, /انجليز|انكليز/, /english/, /رياضيات/, /math/, /علوم/, /science/, /دراسات|درسات|اجتماعيات/, /social/];

// Never in the total, whatever else the name says: «Computer Science»,
// Al-Rahma's «انجليزي مستوي» beside its «انجليزي حكومي».
const NEVER = /حاسب|كمبيوتر|computer|مستوي/;

const isInTotal = (name) => {
  const n = normalize(name);
  if (!n || NEVER.test(n)) return false;
  return IN_TOTAL.some((pattern) => pattern.test(n));
};

module.exports = { isInTotal };
