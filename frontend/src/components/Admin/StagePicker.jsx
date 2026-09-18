import React from "react";
import { STAGES, stageLabel } from "../../constants/stages";

// The step that comes before the records themselves, for an admin looking
// at a school split into stages: pick a stage, then see its classrooms, its
// students, its grades. Rendered as the whole screen while nothing is
// picked, so the choice reads as a way in rather than as a filter that was
// left blank.
const StagePicker = ({ title, subtitle, value, onChange }) => {
  if (!value) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans" dir="rtl">
        <div className="max-w-4xl mx-auto space-y-8 pt-10">
          <div className="text-right space-y-2">
            <h1 className="text-2xl font-black text-slate-800">{title}</h1>
            <p className="text-slate-500 font-bold text-sm">{subtitle}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {STAGES.map((stage) => (
              <button
                key={stage.key}
                onClick={() => onChange(stage.key)}
                className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 text-right hover:border-indigo-200 hover:shadow-lg transition-all group"
              >
                <p className="text-xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                  {stage.label}
                </p>
                <p className="text-xs font-bold text-slate-400 mt-2">
                  اضغط لعرض بيانات المرحلة
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Once a stage is open, it stays visible and switchable at the top of the
  // screen — so it's always clear which part of the school is on show.
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-100 p-3">
      <span className="text-[11px] font-black text-slate-400 uppercase px-2">
        المرحلة
      </span>
      {STAGES.map((stage) => (
        <button
          key={stage.key}
          onClick={() => onChange(stage.key)}
          className={`px-4 py-2 rounded-xl font-black text-xs transition-all ${
            value === stage.key
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          {stageLabel(stage.key)}
        </button>
      ))}
    </div>
  );
};

export default StagePicker;
