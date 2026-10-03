import React, { useState, useEffect, useCallback } from "react";
import API from "../../api/axios";
import PeriodBar from "./PeriodBar";
import { todayIso, shortDate } from "../../utils/reportPeriod";
import {
  X,
  Loader2,
  AlertCircle,
  CalendarX,
  Clock,
  BookOpen,
  Star,
  ThumbsDown,
  ClipboardList,
  Image as ImageIcon,
  FileText,
  Phone,
} from "lucide-react";

// A student's whole record for a week or a month — what the admin opens from
// the students page. Everything comes from one call (/students/:id/record),
// marks worked out exactly as the register and the parent app work them out.

const n = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("ar-EG"));

const COLUMN_LABEL = {
  weeklyEvalScore: "تقييم أسبوعي",
  homeworkScore: "واجب",
  attendanceScore: "مواظبة",
  classworkScore: "كراسة الحصة",
};

const HOMEWORK_STATUS = {
  submitted: ["سلّم", "bg-emerald-50 text-emerald-700"],
  missing: ["ماسلّمش", "bg-rose-50 text-rose-700"],
  ungraded: ["لسه ماتصححش", "bg-slate-100 text-slate-500"],
};

const BEHAVIOR = {
  positive: ["إيجابية", "bg-emerald-50 text-emerald-700"],
  negative: ["سلبية", "bg-rose-50 text-rose-700"],
  neutral: ["ملاحظة", "bg-slate-100 text-slate-600"],
};

const Section = ({ title, icon, count, children }) => (
  <section className="bg-white rounded-[1.75rem] border border-slate-100 shadow-sm overflow-hidden">
    <header className="flex items-center gap-3 px-6 py-4 border-b border-slate-50">
      <span className="text-indigo-600">{icon}</span>
      <h3 className="font-black text-slate-800">{title}</h3>
      {count !== undefined && (
        <span className="text-xs font-black text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5 tabular-nums">{n(count)}</span>
      )}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

const Empty = ({ children }) => <p className="text-sm font-bold text-slate-400 text-center py-4">{children}</p>;

const Stat = ({ label, value, sub, tone }) => (
  <div className={`rounded-2xl p-4 ${tone}`}>
    <p className="text-[11px] font-black opacity-70 mb-1">{label}</p>
    <p className="text-2xl font-black tabular-nums">{value}</p>
    {sub && <p className="text-[11px] font-bold opacity-70 mt-0.5">{sub}</p>}
  </div>
);

const StudentRecord = ({ studentId, onClose }) => {
  const [view, setView] = useState({ period: "week", date: todayIso() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get(`/students/${studentId}/record`, { params: view });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "فشل تحميل سجل الطالب.");
    } finally {
      setLoading(false);
    }
  }, [studentId, view]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const columns = data ? Object.keys(data.max) : [];
  const graded = data ? data.marks.filter((m) => m.weeks.length > 0) : [];
  const ungraded = data ? data.marks.filter((m) => m.weeks.length === 0) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center overflow-y-auto px-3 md:px-8" dir="rtl" onClick={onClose}>
      <div className="w-full max-w-6xl bg-slate-50 rounded-[2rem] shadow-2xl h-fit my-3 md:my-8" onClick={(e) => e.stopPropagation()}>
        <div className="md:sticky top-0 z-10 bg-white rounded-t-[2rem] shadow-sm border-b border-slate-100 px-6 py-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[11px] font-black text-slate-400 mb-1">سجل الطالب الكامل</p>
            <h2 className="text-2xl font-black text-slate-800">{data?.student.name || "…"}</h2>
            {data && (
              <p className="text-sm font-bold text-slate-500 mt-1 flex flex-wrap gap-x-3">
                <span>
                  {data.student.grade}، {data.student.classroom || "من غير فصل"}
                </span>
                {data.student.parent && (
                  <span className="flex items-center gap-1">
                    ولي الأمر: {data.student.parent.name}
                    {data.student.parent.phone && (
                      <span className="flex items-center gap-1 text-slate-400" dir="ltr">
                        <Phone size={12} /> {data.student.parent.phone}
                      </span>
                    )}
                  </span>
                )}
              </p>
            )}
          </div>
          <PeriodBar period={view.period} date={view.date} start={data?.start} onChange={setView} />
          <button onClick={onClose} className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="إغلاق">
            <X size={22} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="animate-spin text-indigo-600" size={38} />
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-100 rounded-[2rem] p-10 text-center">
              <AlertCircle className="mx-auto text-rose-500 mb-3" size={36} />
              <p className="font-bold text-rose-700">{error}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat
                  label="أيام الغياب"
                  value={n(data.attendance.absentDays)}
                  sub={`من ${n(data.attendance.daysRecorded)} يوم متسجّل${data.attendance.excused ? `، ${n(data.attendance.excused)} بعذر` : ""}`}
                  tone="bg-rose-50 text-rose-700"
                />
                <Stat label="مرات التأخير" value={n(data.attendance.late)} tone="bg-amber-50 text-amber-700" />
                <Stat
                  label="الواجبات"
                  value={`${n(data.homework.submitted)}/${n(data.homework.set)}`}
                  sub={data.homework.missing ? `${n(data.homework.missing)} ماسلّمهاش` : "سلّم كل المصحّح"}
                  tone="bg-indigo-50 text-indigo-700"
                />
                <Stat
                  label="ملاحظات السلوك"
                  value={`${n(data.behavior.positive)} + / ${n(data.behavior.negative)} −`}
                  tone="bg-emerald-50 text-emerald-700"
                />
              </div>

              <Section title="الدرجات المرصودة" icon={<ClipboardList size={20} />} count={graded.length}>
                {graded.length === 0 ? (
                  <Empty>مفيش درجات مرصودة للطالب في الفترة دي.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="text-[11px] font-black text-slate-400">
                        <tr>
                          <th className="p-2.5">المادة</th>
                          <th className="p-2.5">الأسبوع</th>
                          {columns.map((c) => (
                            <th key={c} className="p-2.5 whitespace-nowrap">
                              {COLUMN_LABEL[c]} <span className="font-bold">/{n(data.max[c])}</span>
                            </th>
                          ))}
                          <th className="p-2.5 whitespace-nowrap">المجموع /{n(data.weekTotal)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {graded.map((m) =>
                          m.weeks.map((w, i) => (
                            <tr key={`${m.subjectId}:${w.weekStart}`} className={i === 0 ? "border-t border-slate-100" : ""}>
                              {i === 0 && (
                                <td rowSpan={m.weeks.length} className="p-2.5 align-top font-black text-slate-700 whitespace-nowrap">
                                  {m.subject}
                                  {m.teacher && <span className="block text-[11px] font-bold text-slate-400">{m.teacher}</span>}
                                </td>
                              )}
                              <td className="p-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">{shortDate(w.weekStart)}</td>
                              {columns.map((c) => (
                                <td key={c} className="p-2.5 font-bold text-slate-700 tabular-nums">
                                  {n(w[c])}
                                </td>
                              ))}
                              <td className="p-2.5 font-black text-indigo-700 tabular-nums">{n(w.total)}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {ungraded.length > 0 && (
                  <p className="mt-4 text-xs font-bold text-slate-400 leading-6">
                    مواد مفيش لها رصد في الفترة دي: {ungraded.map((m) => m.subject).join("، ")}
                  </p>
                )}
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Section title="الغياب والتأخير" icon={<CalendarX size={20} />} count={data.attendance.entries.length}>
                  {data.attendance.entries.length === 0 ? (
                    <Empty>
                      {data.attendance.records === 0 ? "مفيش حضور متسجّل في الفترة دي." : "حاضر في كل الأيام المتسجّلة."}
                    </Empty>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {data.attendance.entries.map((a, i) => (
                        <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                              a.status === "late" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {a.status === "late" ? "متأخر" : a.excused ? "غائب بعذر" : "غائب"}
                          </span>
                          <span className="font-bold text-slate-700">{shortDate(a.date)}</span>
                          {a.subject && <span className="text-xs font-bold text-slate-400">{a.subject}</span>}
                          {a.recordedBy && <span className="text-xs font-bold text-slate-400 mr-auto">سجّله: {a.recordedBy}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="ملاحظات السلوك" icon={<Star size={20} />} count={data.behavior.rows.length}>
                  {data.behavior.rows.length === 0 ? (
                    <Empty>مفيش ملاحظات سلوك في الفترة دي.</Empty>
                  ) : (
                    <ul className="space-y-3">
                      {data.behavior.rows.map((b, i) => (
                        <li key={i} className="text-sm">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${BEHAVIOR[b.type]?.[1]}`}>
                              {b.type === "negative" && <ThumbsDown size={10} className="inline ml-1" />}
                              {BEHAVIOR[b.type]?.[0]}
                            </span>
                            <span className="text-xs font-bold text-slate-400">
                              {shortDate(b.date)}، {b.subject}، {b.teacher}
                            </span>
                          </div>
                          <p className="font-bold text-slate-700 leading-6">{b.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.behavior.negative > 0 && (
                    <p className="mt-3 text-[11px] font-bold text-slate-400">الملاحظات السلبية بتوصل لولي الأمر بس، الطالب مابيشوفهاش.</p>
                  )}
                </Section>
              </div>

              <Section title="الواجبات" icon={<BookOpen size={20} />} count={data.homework.rows.length}>
                {data.homework.rows.length === 0 ? (
                  <Empty>مفيش واجبات اتدّت لفصله في الفترة دي.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="text-[11px] font-black text-slate-400">
                        <tr>
                          <th className="p-2.5">اتدّى يوم</th>
                          <th className="p-2.5">المادة</th>
                          <th className="p-2.5">الواجب</th>
                          <th className="p-2.5">التسليم</th>
                          <th className="p-2.5">الحالة</th>
                          <th className="p-2.5">الدرجة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.homework.rows.map((h, i) => (
                          <tr key={i}>
                            <td className="p-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">{shortDate(h.setAt)}</td>
                            <td className="p-2.5 font-bold text-slate-700 whitespace-nowrap">
                              {h.subject}
                              <span className="block text-[11px] text-slate-400">{h.teacher}</span>
                            </td>
                            <td className="p-2.5 font-bold text-slate-700">
                              {h.title}
                              {h.pageNumber && <span className="text-xs text-slate-400">، ص {h.pageNumber}</span>}
                              {h.feedback && <span className="block text-[11px] text-indigo-500">{h.feedback}</span>}
                            </td>
                            <td className="p-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">{shortDate(h.dueDate)}</td>
                            <td className="p-2.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black whitespace-nowrap ${HOMEWORK_STATUS[h.status][1]}`}>
                                {HOMEWORK_STATUS[h.status][0]}
                              </span>
                            </td>
                            <td className="p-2.5 font-black text-slate-700 tabular-nums whitespace-nowrap">
                              {h.totalMarks ? `${n(h.score)}/${n(h.totalMarks)}` : "من غير درجة"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Section title="الاختبارات" icon={<FileText size={20} />} count={data.tests.length}>
                  {data.tests.length === 0 ? (
                    <Empty>مفيش اختبارات متسجّلة في الفترة دي.</Empty>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {data.tests.map((t, i) => (
                        <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="font-black text-slate-700">{t.subject}</span>
                          <span className="text-xs font-bold text-slate-400">{t.label}</span>
                          <span className="mr-auto font-black text-indigo-700 tabular-nums">
                            {n(t.grade)}/{n(t.outOf)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="ملاحظات السبورة اللي وصلت لفصله" icon={<ImageIcon size={20} />} count={data.boardNotes.length}>
                  {data.boardNotes.length === 0 ? (
                    <Empty>مفيش ملاحظات سبورة في الفترة دي.</Empty>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {data.boardNotes.map((b, i) => (
                        <li key={i} className="py-2.5 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-slate-700">{b.subject || "—"}</span>
                            <span className="text-xs font-bold text-slate-400">
                              {shortDate(b.date)}، {b.teacher}، {b.images === 1 ? "صورة واحدة" : `${n(b.images)} صور`}
                            </span>
                          </div>
                          {b.caption && <p className="font-bold text-slate-600 mt-1">{b.caption}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              <p className="flex items-center gap-2 text-[11px] font-bold text-slate-400 px-2">
                <Clock size={12} />
                الدرجات محسوبة بنفس طريقة كشف الدرجات المطبوع وتطبيق ولي الأمر.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentRecord;
