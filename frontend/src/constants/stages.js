// The four educational stages a school can be split into, mirroring
// backend/src/utils/stages.js — the keys are what the API stores.
//
// A note on wording: this app already calls a Grade a "مرحلة" in places
// ("إدارة المراحل الدراسية"), so a stage is labelled "المرحلة التعليمية"
// everywhere it appears, to keep the two apart for the people using it.
export const STAGES = [
  { key: "kindergarten", label: "رياض الأطفال" },
  { key: "primary", label: "الابتدائي" },
  { key: "preparatory", label: "الإعدادي" },
  { key: "secondary", label: "الثانوي" },
];

export const stageLabel = (stage) =>
  STAGES.find((entry) => entry.key === stage)?.label || "غير محددة";
