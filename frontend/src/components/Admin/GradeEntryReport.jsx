import React, { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import { STAGES } from "../../constants/stages";
import PeriodBar from "./PeriodBar";
import { todayIso, sinceLabel } from "../../utils/reportPeriod";
import { Loader2, AlertCircle, Users, CheckCircle2, CircleDashed, XCircle, ChevronDown, Search } from "lucide-react";

// رصد الدرجات — which teachers recorded marks for their classes in a week or
// a month, and which didn't. Each class shows exactly its own school's
// register columns, each in its own cell — Al-Rahma's مواظبة · واجب ·
// تقييم أسبوعي · كراسة الحصة, the weekly40 الواجب المنزلي · تقييم أسبوعي ·
// مواظبة وسلوك. The server does the counting; this only lays it out.

const STATUS = {
  complete: { label: "رصد كامل", pill: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500" },
  partial: { label: "رصد ناقص", pill: "bg-amber-50 text-amber-700 border-amber-100", dot: "bg-amber-500" },
  none: { label: "لم يرصد", pill: "bg-rose-50 text-rose-700 border-rose-100", dot: "bg-rose-500" },
};

// The register's columns for one teacher's classes, in the register's own
// order. A teacher on one school has one set; the union only matters for
// someone teaching across stages that mark differently.
const COLUMN_ORDER = ["attendance", "homework", "weekly", "classwork", "conduct"];
const registerColumns = (classes) => {
  const seen = new Map();
  for (const c of classes) for (const col of c.columns) if (!seen.has(col.key)) seen.set(col.key, col);
  return COLUMN_ORDER.filter((k) => seen.has(k)).map((k) => seen.get(k));
};

const n = (value) => Number(value || 0).toLocaleString("ar-EG");

// One required column for one class.
//   week  → "٣٤/٣٤ طالب"
//   month → "٣ من ٤ أسابيع"
const Coverage = ({ cell, students, period, weeks }) => {
  let tone = "text-rose-600 bg-rose-50";
  let text;
  if (period === "week") {
    if (cell.students >= students) tone = "text-emerald-700 bg-emerald-50";
    else if (cell.students > 0) tone = "text-amber-700 bg-amber-50";
    text = `${n(cell.students)}/${n(students)} طالب`;
  } else {
    if (weeks > 0 && cell.weeksDone >= weeks) tone = "text-emerald-700 bg-emerald-50";
    else if (cell.weeksDone > 0 || cell.weeksPartial > 0) tone = "text-amber-700 bg-amber-50";
    text = `${n(cell.weeksDone)} من ${n(weeks)} أسابيع`;
  }
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black tabular-nums ${tone}`}>
      {text}
      {period === "month" && cell.weeksPartial > 0 && (
        <span className="font-bold opacity-70"> (+{n(cell.weeksPartial)} ناقص)</span>
      )}
    </span>
  );
};

const GradeEntryReport = () => {
  const { browsesByStage } = useAdminScope();
  const [view, setView] = useState({ period: "week", date: todayIso() });
  const [stage, setStage] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(() => new Set());

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { period: view.period, date: view.date, ...(stage ? { stage } : {}) };
      const res = await API.get("/analytics/grade-entry", { params });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "فشل تحميل تقرير الرصد.");
    } finally {
      setLoading(false);
    }
  }, [view, stage]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const teachers = useMemo(() => {
    const list = report?.teachers || [];
    const q = query.trim();
    return list.filter((t) => (filter === "all" || t.status === filter) && (!q || t.name.includes(q)));
  }, [report, filter, query]);

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const weeks = report?.weeks?.length || 0;
  const summary = report?.summary || { teachers: 0, complete: 0, partial: 0, none: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <PeriodBar period={view.period} date={view.date} start={report?.start} onChange={setView} />
        {browsesByStage && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="p-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-indigo-500/20"
          >
            <option value="">كل المراحل</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["all", "كل المعلمين", summary.teachers, <Users size={22} />, "bg-indigo-50 text-indigo-600"],
          ["complete", "رصد كامل", summary.complete, <CheckCircle2 size={22} />, "bg-emerald-50 text-emerald-600"],
          ["partial", "رصد ناقص", summary.partial, <CircleDashed size={22} />, "bg-amber-50 text-amber-600"],
          ["none", "لم يرصد أي درجة", summary.none, <XCircle size={22} />, "bg-rose-50 text-rose-600"],
        ].map(([key, title, value, icon, tone]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`p-5 rounded-[1.75rem] border-2 bg-white flex items-center gap-4 text-right transition-all ${
              filter === key ? "border-indigo-400 shadow-md" : "border-transparent shadow-sm hover:border-slate-200"
            }`}
          >
            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
            <span>
              <span className="block text-[11px] font-black text-slate-400 mb-1">{title}</span>
              <span className="block text-2xl font-black text-slate-800 tabular-nums">{n(value)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث باسم المعلم..."
          className="w-full pr-12 pl-4 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:border-indigo-400 font-bold text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-indigo-600" size={36} />
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-100 rounded-[2rem] p-10 text-center">
          <AlertCircle className="mx-auto text-rose-500 mb-3" size={36} />
          <p className="font-bold text-rose-700">{error}</p>
        </div>
      ) : weeks === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-14 text-center font-bold text-slate-400">
          الفترة دي لسه مابدأتش، فمفيش رصد مطلوب فيها.
        </div>
      ) : teachers.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-14 text-center font-bold text-slate-400">
          مفيش معلمين في الاختيار ده.
        </div>
      ) : (
        <div className="space-y-3">
          {teachers.map((t) => {
            const isOpen = open.has(t.id);
            const done = t.classes.filter((c) => c.status === "complete").length;
            return (
              <div key={t.id} className="bg-white rounded-[1.75rem] border border-slate-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggle(t.id)}
                  className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 p-5 text-right hover:bg-slate-50/60"
                  aria-expanded={isOpen}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS[t.status].dot}`} />
                  <span className="font-black text-slate-800 flex-1 min-w-[180px]">{t.name}</span>
                  <span className="text-xs font-bold text-slate-500 tabular-nums">
                    {n(done)} من {n(t.classes.length)} {t.classes.length === 1 ? "فصل" : "فصول"} مكتملة
                  </span>
                  <span className="text-xs font-bold text-slate-400">آخر رصد: {sinceLabel(t.lastEntryAt)}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black border ${STATUS[t.status].pill}`}>
                    {STATUS[t.status].label}
                  </span>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-50/70 text-[11px] font-black text-slate-400">
                        <tr>
                          <th className="p-3 pr-5">الفصل</th>
                          <th className="p-3">المادة</th>
                          {registerColumns(t.classes).map((col) => (
                            <th key={col.key} className="p-3 whitespace-nowrap">
                              {col.label} <span className="font-bold">/{n(col.max)}</span>
                            </th>
                          ))}
                          <th className="p-3 pl-5">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {t.classes.map((c) => (
                          <tr key={`${c.classroomId}:${c.subject}`}>
                            <td className="p-3 pr-5 font-black text-slate-700 whitespace-nowrap">
                              {c.classroom}
                              <span className="block text-[11px] font-bold text-slate-400">
                                {c.grade}، {n(c.students)} طالب
                              </span>
                            </td>
                            <td className="p-3 font-bold text-slate-600 whitespace-nowrap">{c.subject}</td>
                            {registerColumns(t.classes).map((col) => {
                              const cell = c.columns.find((x) => x.key === col.key);
                              return (
                                <td key={col.key} className="p-3">
                                  {!cell ? (
                                    <span className="text-slate-300 text-xs font-bold">—</span>
                                  ) : !cell.applicable ? (
                                    <span className="text-slate-300 text-xs font-bold whitespace-nowrap">مفيش واجب</span>
                                  ) : (
                                    <Coverage cell={cell} students={c.students} period={report.period} weeks={weeks} />
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-3 pl-5">
                              <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border whitespace-nowrap ${STATUS[c.status].pill}`}>
                                {STATUS[c.status].label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GradeEntryReport;
