import React from "react";
import { ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { shiftPeriod, todayIso, periodLabel } from "../../utils/reportPeriod";

// أسبوع / شهر, with arrows to step back and forward through them. Shared by
// the grade-entry report and the student record so both move the same way.
const PeriodBar = ({ period, date, start, onChange }) => (
  <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
    <div className="flex bg-slate-100 rounded-xl p-1">
      {[
        ["week", "أسبوع"],
        ["month", "شهر"],
      ].map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange({ period: key, date })}
          className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
            period === key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>

    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange({ period, date: shiftPeriod(date, period, -1) })}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="السابق"
        title="السابق"
      >
        <ChevronRight size={18} />
      </button>
      <span className="min-w-[200px] text-center text-sm font-black text-slate-700 tabular-nums">
        {periodLabel(period, start)}
      </span>
      <button
        onClick={() => onChange({ period, date: shiftPeriod(date, period, 1) })}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="التالي"
        title="التالي"
      >
        <ChevronLeft size={18} />
      </button>
    </div>

    <button
      onClick={() => onChange({ period, date: todayIso() })}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black text-indigo-600 hover:bg-indigo-50"
    >
      <CalendarDays size={14} />
      {period === "month" ? "الشهر الحالي" : "الأسبوع الحالي"}
    </button>
  </div>
);

export default PeriodBar;
