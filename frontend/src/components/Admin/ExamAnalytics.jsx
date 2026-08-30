import React, { useState, useEffect, useCallback } from "react";
import API from "../../api/axios";
import {
  BarChart3,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle2,
} from "lucide-react";

// A read-only report over grades teachers have already entered — no new
// data entry, just the "where are we weak" answer a principal actually
// wants instead of scrolling raw grade tables.
const ExamAnalytics = () => {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    API.get("/exams")
      .then((res) => setExams(res.data.data || []))
      .catch(() => setError("فشل تحميل الامتحانات"));
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = selectedExam ? { examId: selectedExam } : {};
      const res = await API.get("/analytics/exams", { params });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "فشل تحميل التقرير.");
    } finally {
      setLoading(false);
    }
  }, [selectedExam]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <BarChart3 className="text-indigo-600" size={36} /> تحليلات النتائج
            </h1>
            <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
              المتوسطات، نسب النجاح، ونقاط الضعف
            </p>
          </div>

          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-sm min-w-[240px]"
          >
            <option value="">كل الامتحانات</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title} — {e.academicYear}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="animate-spin text-indigo-600" size={40} />
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-100 rounded-[2rem] p-10 text-center max-w-md mx-auto">
            <AlertCircle className="mx-auto text-rose-500 mb-4" size={40} />
            <p className="font-bold text-rose-700">{error}</p>
          </div>
        ) : report.totalResults === 0 ? (
          <div className="bg-white border border-slate-100 rounded-[2rem] p-16 text-center">
            <p className="font-bold text-slate-400">
              لا يوجد درجات مسجّلة بعد لهذا الاختيار.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="النتائج المسجّلة" value={report.totalResults} icon={<Users />} color="blue" />
              <StatCard title="المتوسط العام" value={`${report.overallAverage}`} icon={<BarChart3 />} color="indigo" />
              <StatCard title="نسبة النجاح" value={`${report.overallPassRate}%`} icon={<CheckCircle2 />} color="emerald" />
              <StatCard
                title="أضعف مادة"
                value={report.weakestSubject?.label || "—"}
                sub={report.weakestSubject ? `المتوسط ${report.weakestSubject.average}` : ""}
                icon={<TrendingDown />}
                color="rose"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownTable title="حسب المادة" rows={report.bySubject} />
              <BreakdownTable title="حسب الفصل" rows={report.byClassroom} />
            </div>

            <BreakdownTable title="حسب المعلم" rows={report.byTeacher} />
          </>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, sub, icon, color }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };
  return (
    <div className="p-6 rounded-[2rem] border-2 bg-white flex items-center gap-5 shadow-sm">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${colors[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-xl font-black text-slate-800 tracking-tight truncate" title={value}>
          {value}
        </p>
        {sub && <p className="text-[11px] font-bold text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

const BreakdownTable = ({ title, rows }) => (
  <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
    <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">{title}</h2>
    {rows.length === 0 ? (
      <p className="text-slate-400 font-bold text-sm py-6 text-center">لا توجد بيانات.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th className="py-2 pl-4">الاسم</th>
              <th className="py-2 pl-4">المتوسط</th>
              <th className="py-2 pl-4">نسبة النجاح</th>
              <th className="py-2">النتائج</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pl-4 font-bold text-slate-700 text-sm">{r.label}</td>
                <td className="py-3 pl-4 font-black text-slate-800 tabular-nums">{r.average}</td>
                <td className="py-3 pl-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      r.passRate >= 70
                        ? "bg-emerald-50 text-emerald-600"
                        : r.passRate >= 40
                        ? "bg-amber-50 text-amber-600"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {r.passRate}%
                  </span>
                </td>
                <td className="py-3 font-bold text-slate-500 text-sm tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default ExamAnalytics;
