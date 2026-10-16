import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import { STAGES } from "../../constants/stages";
import { periodLabel, shiftPeriod, todayIso } from "../../utils/reportPeriod";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock,
  ListChecks,
  Loader2,
  Search,
  Users,
} from "lucide-react";

// آخر التطورات — for one week, every teacher's classes and, for each, the
// four marks of the week: درجة الواجبات، المواظبة والسلوك، كراسة الحصة،
// تقييم الأسبوع — which are recorded and which are still left. The same
// counts as رصد الدرجات (backend gradeEntryController), laid out as what is
// done and what remains.

const LABELS = {
  homework: "درجة الواجبات",
  conduct: "المواظبة والسلوك",
  attendance: "المواظبة والسلوك",
  classwork: "كراسة الحصة",
  weekly: "تقييم الأسبوع",
};
const ORDER = ["homework", "conduct", "attendance", "classwork", "weekly"];

const n = (value) => Number(value || 0).toLocaleString("ar-EG");

// One mark of one class this week: done, partly done, not started, or not
// the teacher's to record (no homework set, مواظبة worked out from the
// attendance register).
const stateOf = (col, students) => {
  if (col.key === "homework" && !col.applicable) return { kind: "na", note: "مفيش واجب" };
  if (col.key === "attendance" && !col.entered) return { kind: "na", note: "من الحضور" };
  if (col.full) return { kind: "done" };
  if (col.students > 0) return { kind: "partial", note: `${n(col.students)}/${n(students)}` };
  return { kind: "todo" };
};

const CHIP = {
  done: { tone: "bg-emerald-50 text-emerald-700 border-emerald-100", Icon: CheckCircle2 },
  partial: { tone: "bg-amber-50 text-amber-700 border-amber-100", Icon: CircleDashed },
  todo: { tone: "bg-rose-50 text-rose-700 border-rose-100", Icon: Clock },
  na: { tone: "bg-slate-50 text-slate-400 border-slate-100", Icon: null },
};

const LatestProgress = () => {
  const { browsesByStage } = useAdminScope();
  const [date, setDate] = useState(todayIso());
  const [stage, setStage] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("remaining");
  const [query, setQuery] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { period: "week", date, ...(stage ? { stage } : {}) };
      const res = await API.get("/analytics/grade-entry", { params });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "فشل تحميل آخر التطورات.");
    } finally {
      setLoading(false);
    }
  }, [date, stage]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Each teacher with their classes' marks sorted into done and remaining.
  const teachers = useMemo(
    () =>
      (report?.teachers || []).map((t) => {
        const classes = t.classes.map((c) => ({
          ...c,
          items: [...c.columns]
            .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
            .map((col) => ({ key: col.key, ...stateOf(col, c.students) })),
        }));
        const owed = classes.flatMap((c) => c.items.filter((i) => i.kind !== "na"));
        const done = owed.filter((i) => i.kind === "done").length;
        return { ...t, classes, owed: owed.length, done, remaining: owed.length - done };
      }),
    [report],
  );

  const totals = useMemo(() => {
    const owed = teachers.reduce((s, t) => s + t.owed, 0);
    const done = teachers.reduce((s, t) => s + t.done, 0);
    return {
      teachers: teachers.length,
      finished: teachers.filter((t) => t.owed > 0 && t.remaining === 0).length,
      behind: teachers.filter((t) => t.remaining > 0).length,
      remaining: owed - done,
      percent: owed ? Math.round((done / owed) * 100) : 0,
    };
  }, [teachers]);

  const shown = teachers.filter((t) => {
    if (filter === "remaining" && t.remaining === 0) return false;
    if (filter === "finished" && t.remaining > 0) return false;
    const q = query.trim();
    return !q || t.name.includes(q);
  });

  const weekStarted = (report?.weeks?.length || 0) > 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <ListChecks className="text-emerald-600" size={34} /> آخر التطورات
          </h1>
          <p className="text-slate-500 font-bold mt-1 text-sm">
            الأسبوع ده: كل معلم رصد إيه ولسه عليه إيه — درجة الواجبات، المواظبة والسلوك، كراسة الحصة، تقييم الأسبوع.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
            <button
              onClick={() => setDate(shiftPeriod(date, "week", -1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="الأسبوع السابق"
              title="الأسبوع السابق"
            >
              <ChevronRight size={18} />
            </button>
            <span className="min-w-[200px] text-center text-sm font-black text-slate-700 tabular-nums">
              {periodLabel("week", report?.start)}
            </span>
            <button
              onClick={() => setDate(shiftPeriod(date, "week", 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="الأسبوع التالي"
              title="الأسبوع التالي"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setDate(todayIso())}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black text-indigo-600 hover:bg-indigo-50"
            >
              <CalendarDays size={14} /> الأسبوع الحالي
            </button>
          </div>
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

        {!loading && !error && weekStarted && (
          <div className="bg-white rounded-[1.75rem] border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["remaining", "معلمين لسه عليهم رصد", totals.behind, "text-rose-600"],
                ["finished", "معلمين خلصوا رصد الأسبوع", totals.finished, "text-emerald-600"],
                ["all", "كل المعلمين", totals.teachers, "text-indigo-600"],
                [null, "بنود رصد باقية", totals.remaining, "text-amber-600"],
              ].map(([key, title, value, tone]) => (
                <button
                  key={title}
                  disabled={!key}
                  onClick={() => key && setFilter(key)}
                  className={`p-4 rounded-2xl border-2 text-right transition-all ${
                    key && filter === key ? "border-indigo-400 bg-indigo-50/40" : "border-slate-100 bg-slate-50/60"
                  } ${key ? "hover:border-slate-300" : "cursor-default"}`}
                >
                  <span className="block text-[11px] font-black text-slate-400 mb-1">{title}</span>
                  <span className={`block text-2xl font-black tabular-nums ${tone}`}>{n(value)}</span>
                </button>
              ))}
            </div>
            <div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totals.percent}%` }} />
              </div>
              <p className="mt-2 text-xs font-black text-slate-500">
                اتعمل {n(totals.percent)}% من رصد الأسبوع في المدرسة.
              </p>
            </div>
          </div>
        )}

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
        ) : !weekStarted ? (
          <div className="bg-white border border-slate-100 rounded-[2rem] p-14 text-center font-bold text-slate-400">
            الأسبوع ده لسه مابدأش، فمفيش رصد مطلوب فيه.
          </div>
        ) : shown.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-[2rem] p-14 text-center font-bold text-slate-400">
            {filter === "remaining" ? "كل المعلمين خلصوا رصد الأسبوع ده." : "مفيش معلمين في الاختيار ده."}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((t) => (
              <div key={t.id} className="bg-white rounded-[1.75rem] border border-slate-100 shadow-sm p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Users size={18} className="text-slate-400" />
                  <span className="font-black text-slate-800 flex-1 min-w-[180px]">{t.name}</span>
                  <span className="text-xs font-black text-emerald-700 tabular-nums">اتعمل {n(t.done)}</span>
                  <span className={`text-xs font-black tabular-nums ${t.remaining ? "text-rose-600" : "text-slate-400"}`}>
                    باقي {n(t.remaining)}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {t.classes.map((c) => (
                    <div key={`${c.classroomId}:${c.subjectId}`} className="py-2.5 flex flex-col lg:flex-row lg:items-center gap-2">
                      <div className="lg:w-56 shrink-0">
                        <p className="font-black text-slate-700 text-sm">
                          {c.subject} — {c.classroom}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400">
                          {c.grade}، {n(c.students)} طالب
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {c.items.map((item) => {
                          const chip = CHIP[item.kind];
                          const Icon = chip.Icon;
                          return (
                            <span
                              key={item.key}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black ${chip.tone}`}
                            >
                              {Icon && <Icon size={13} />}
                              {LABELS[item.key] || item.key}
                              {item.kind === "done" && <span className="font-bold">· اترصدت</span>}
                              {item.kind === "todo" && <span className="font-bold">· لسه</span>}
                              {item.note && <span className="font-bold tabular-nums">· {item.note}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LatestProgress;
