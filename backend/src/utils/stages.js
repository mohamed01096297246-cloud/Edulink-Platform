// The four educational stages a school can be split into. A school that
// runs as one undivided unit simply leaves every grade's `stage` unset —
// the field is what a stage-scoped principal is matched against, and a
// school with no such principals never needs to fill it in.
//
// The keys are stored; the Arabic labels are for messages the school reads.
const STAGES = ["kindergarten", "primary", "preparatory", "secondary"];

const STAGE_LABELS = {
  kindergarten: "رياض الأطفال",
  primary: "الابتدائي",
  preparatory: "الإعدادي",
  secondary: "الثانوي",
};

const stageLabel = (stage) => STAGE_LABELS[stage] || "غير محددة";

// Grades are named in Arabic by the schools themselves ("الصف الأول
// الابتدائي"), so an unclassified grade can usually be placed by reading
// its name. Used to pre-fill the field for schools that existed before
// stages did — never to override a stage an admin set by hand.
const guessStage = (gradeName = "") => {
  const name = String(gradeName);
  if (/روضة|تمهيدي|حضانة|kg/i.test(name)) return "kindergarten";
  if (/ابتدائ/.test(name)) return "primary";
  if (/إعدادي|اعدادي|متوسط/.test(name)) return "preparatory";
  if (/ثانوي/.test(name)) return "secondary";
  return null;
};

module.exports = { STAGES, STAGE_LABELS, stageLabel, guessStage };
