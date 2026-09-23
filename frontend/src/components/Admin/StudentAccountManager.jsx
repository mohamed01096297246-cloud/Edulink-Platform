import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import {
  KeyRound,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";

// Issuing the logins students use for the app. Only preparatory and
// secondary grades appear here — younger years are followed by their
// parents, who keep their own account either way.
//
// The one thing this screen must get right: a password exists in readable
// form ONLY in the response that created it (they are stored hashed). So
// whatever comes back is held on screen until the admin has printed it,
// and the screen says so plainly rather than letting them navigate away
// and discover it later.
const StudentAccountManager = () => {
  const { canEdit } = useAdminScope();
  const [grades, setGrades] = useState([]);
  const [grade, setGrade] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [issued, setIssued] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    API.get("/student-accounts/grades")
      .then((res) => {
        const list = res.data?.data || [];
        setGrades(list);
        if (list.length === 1) setGrade(list[0]._id);
      })
      .catch(() => showToast("تعذّر تحميل المراحل", "error"));
  }, []);

  const loadStudents = async (gradeId) => {
    if (!gradeId) return setStudents([]);
    setLoading(true);
    try {
      const res = await API.get("/student-accounts", { params: { grade: gradeId } });
      setStudents(res.data?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر تحميل الطلاب", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents(grade);
  }, [grade]);

  const withoutAccount = students.filter((s) => !s.hasAccount);

  const issueAll = async () => {
    setWorking(true);
    try {
      const res = await API.post("/student-accounts/issue", { grade });
      setIssued({ title: "بيانات دخول جديدة", rows: res.data?.data || [] });
      showToast(res.data?.message || "تم الإصدار");
      loadStudents(grade);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر إصدار الحسابات", "error");
    } finally {
      setWorking(false);
    }
  };

  const reissue = async (student) => {
    setWorking(true);
    try {
      const res = await API.post(`/student-accounts/${student._id}/reissue`);
      setIssued({ title: "كلمة مرور جديدة", rows: [res.data.data] });
      showToast(res.data.message);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّرت إعادة الإصدار", "error");
    } finally {
      setWorking(false);
    }
  };

  const print = () => window.print();

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen" dir="rtl">
      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border text-sm font-bold no-print ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="text-emerald-500" size={20} />
          ) : (
            <XCircle className="text-rose-500" size={20} />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="mr-2 p-1 hover:bg-black/5 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8 no-print">
          <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
            <KeyRound size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              بيانات دخول الطلاب
            </h1>
            <p className="text-slate-400 font-medium text-sm italic">
              للمرحلة الإعدادية والثانوية — كود دخول لكل طالب مع كلمة مرور ثابتة
            </p>
          </div>
        </div>

        {/* The printable sheet. Kept mounted above everything else while it
            exists, because these passwords cannot be shown a second time. */}
        {issued && (
          <div className="bg-white rounded-[2rem] border-2 border-emerald-200 shadow-sm mb-8 overflow-hidden print-area">
            <div className="p-6 bg-emerald-50/60 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                <div>
                  <p className="font-black text-slate-800 text-sm">
                    اطبع الكشف ده دلوقتي
                  </p>
                  <p className="text-[12px] font-bold text-slate-500 mt-0.5">
                    كلمات المرور متخزنة مشفّرة — مش هتقدر تشوفها تاني بعد ما تقفل
                    الصفحة. لو ضاعت، هتحتاج تعمل إعادة إصدار.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={print}
                  className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-600 transition-colors"
                >
                  <Printer size={16} /> طباعة
                </button>
                <button
                  onClick={() => setIssued(null)}
                  className="px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-colors"
                >
                  تم، اقفل
                </button>
              </div>
            </div>

            <div className="p-6">
              <h2 className="hidden print:block text-xl font-black mb-4">
                {issued.title}
              </h2>
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="p-3 text-[11px] font-black text-slate-400 uppercase">الطالب</th>
                    <th className="p-3 text-[11px] font-black text-slate-400 uppercase">الفصل</th>
                    <th className="p-3 text-[11px] font-black text-slate-400 uppercase">كود الدخول</th>
                    <th className="p-3 text-[11px] font-black text-slate-400 uppercase">كلمة المرور</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {issued.rows.map((row) => (
                    <tr key={row.student}>
                      <td className="p-3 font-bold text-slate-700 text-sm">{row.fullName}</td>
                      <td className="p-3 font-bold text-slate-400 text-xs">{row.classroom || "—"}</td>
                      <td className="p-3 font-mono font-black text-slate-800 tracking-widest">
                        {row.username}
                      </td>
                      <td className="p-3 font-mono font-black text-indigo-700 tracking-widest">
                        {row.password}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 mb-8 no-print">
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="bg-white border border-slate-200 px-6 py-4 rounded-2xl font-bold text-slate-600 outline-none focus:border-indigo-500 shadow-sm cursor-pointer flex-grow"
          >
            <option value="">اختر المرحلة</option>
            {grades.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>

          {canEdit && grade && withoutAccount.length > 0 && (
            <button
              onClick={issueAll}
              disabled={working}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-60"
            >
              {working ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              إصدار لـ {withoutAccount.length} طالب
            </button>
          )}
        </div>

        {grades.length === 0 && (
          <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center no-print">
            <p className="text-slate-400 font-bold">
              مفيش مراحل إعدادية أو ثانوية في المدرسة دي — حسابات الطلاب متاحة
              للمرحلتين دول بس.
            </p>
          </div>
        )}

        {grade && (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden no-print">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <p className="font-black text-slate-700 text-sm">
                {students.length} طالب — {students.filter((s) => s.hasAccount).length} لهم
                حسابات
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">الطالب</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">الفصل</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">كود الدخول</th>
                    <th className="p-5 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="p-16 text-center">
                        <Loader2 className="animate-spin inline text-indigo-600" size={36} />
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-12 text-center text-slate-400 font-bold">
                        مفيش طلاب في المرحلة دي.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => (
                      <tr key={student._id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="p-5 font-black text-slate-700 text-sm">{student.fullName}</td>
                        <td className="p-5 font-bold text-slate-400 text-xs">
                          {student.classroom || "بدون فصل"}
                        </td>
                        <td className="p-5">
                          {student.username ? (
                            <span className="font-mono font-black text-slate-800 tracking-widest">
                              {student.username}
                            </span>
                          ) : (
                            <span className="text-[11px] font-black text-slate-300">
                              لسه مفيش حساب
                            </span>
                          )}
                        </td>
                        <td className="p-5 text-center">
                          {canEdit && student.hasAccount && (
                            <button
                              onClick={() => reissue(student)}
                              disabled={working}
                              title="كلمة مرور جديدة"
                              className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all disabled:opacity-50"
                            >
                              <RefreshCw size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-area { border: none !important; box-shadow: none !important; }
        }
      `,
        }}
      />
    </div>
  );
};

export default StudentAccountManager;
