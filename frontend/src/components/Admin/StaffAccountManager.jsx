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

// Issuing teachers their logins straight off the school's staff list — the
// same way students get theirs: a six-digit code and a readable password
// each, issued in one go and printed. See StudentAccountManager for the
// students' side.
//
// A password exists in readable form ONLY in the response that created it
// (they are stored hashed), so whatever comes back stays on screen until
// the admin has printed it.
const StaffAccountManager = () => {
  const { canEdit } = useAdminScope();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [issued, setIssued] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get("/staff-candidates/accounts");
      setStaff(res.data?.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر تحميل قائمة المعلمين", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const issuable = staff.filter((s) => s.issuable);
  const withAccount = staff.filter((s) => s.hasAccount);
  const noSubject = staff.filter((s) => !s.hasAccount && !s.issuable);

  const issueAll = async () => {
    setWorking(true);
    try {
      const res = await API.post("/staff-candidates/accounts/issue", {});
      setIssued({ title: "بيانات دخول المعلمين", rows: res.data?.data || [] });
      showToast(res.data?.message || "تم الإصدار");
      load();
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر إصدار الحسابات", "error");
    } finally {
      setWorking(false);
    }
  };

  const reissue = async (member) => {
    setWorking(true);
    try {
      const res = await API.post(`/staff-candidates/accounts/${member._id}/reissue`);
      setIssued({ title: "كلمة مرور جديدة", rows: [res.data.data] });
      showToast(res.data.message);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّرت إعادة الإصدار", "error");
    } finally {
      setWorking(false);
    }
  };

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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 no-print">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <KeyRound size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                بيانات دخول المعلمين
              </h1>
              <p className="text-slate-400 font-medium text-sm italic">
                من قائمة المعلمين — كود دخول لكل معلم مع كلمة مرور ثابتة
              </p>
            </div>
          </div>

          {canEdit && issuable.length > 0 && (
            <button
              onClick={issueAll}
              disabled={working}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-60"
            >
              {working ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              إصدار لـ {issuable.length} معلم
            </button>
          )}
        </div>

        {/* The printable sheet — kept on screen until printed, because
            these passwords cannot be shown a second time. */}
        {issued && (
          <div className="bg-white rounded-[2rem] border-2 border-emerald-200 shadow-sm mb-8 overflow-hidden print-area">
            <div className="p-6 bg-emerald-50/60 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                <div>
                  <p className="font-black text-slate-800 text-sm">اطبع الكشف ده دلوقتي</p>
                  <p className="text-[12px] font-bold text-slate-500 mt-0.5">
                    كلمات المرور متخزنة مشفّرة — مش هتقدر تشوفها تاني بعد ما تقفل
                    الصفحة. لو ضاعت، هتحتاج تعمل إعادة إصدار.
                  </p>
                  <p className="text-[12px] font-bold text-slate-500 mt-0.5">
                    من نافذة الطباعة اختار «حفظ بصيغة PDF» عشان تحتفظ بنسخة عندك
                    قبل ما تطبع على ورق.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => window.print()}
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
              <div className="hidden print:block mb-4">
                <h2 className="text-xl font-black">{issued.title}</h2>
                <p className="text-sm font-bold">
                  {new Date().toLocaleDateString("ar-EG")} · عدد المعلمين:{" "}
                  {issued.rows.length}
                </p>
              </div>
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="p-3 text-[11px] font-black text-slate-400">المعلم</th>
                    <th className="p-3 text-[11px] font-black text-slate-400">المادة</th>
                    <th className="p-3 text-[11px] font-black text-slate-400">كود الدخول</th>
                    <th className="p-3 text-[11px] font-black text-slate-400">كلمة المرور</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {issued.rows.map((row) => (
                    <tr key={row.candidate}>
                      <td className="p-3 font-bold text-slate-700 text-sm">{row.fullName}</td>
                      <td className="p-3 font-bold text-slate-400 text-xs">{row.subject || "—"}</td>
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

        {noSubject.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 no-print">
            <p className="text-[12px] font-black text-amber-800">
              {noSubject.length} في القائمة مالهمش مادة في المدرسة، فمش هيتعمل لهم حساب
              معلم: {noSubject.map((s) => `${s.fullName} (${s.subjectLabel || "—"})`).join("، ")}
            </p>
          </div>
        )}

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden no-print">
          <div className="p-6 border-b border-slate-100">
            <p className="font-black text-slate-700 text-sm">
              {staff.length} في القائمة — {withAccount.length} لهم حسابات
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-5 text-[11px] font-black text-slate-400 tracking-widest">المعلم</th>
                  <th className="p-5 text-[11px] font-black text-slate-400 tracking-widest">المادة</th>
                  <th className="p-5 text-[11px] font-black text-slate-400 tracking-widest">كود الدخول</th>
                  <th className="p-5 text-[11px] font-black text-slate-400 tracking-widest text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-16 text-center">
                      <Loader2 className="animate-spin inline text-indigo-600" size={36} />
                    </td>
                  </tr>
                ) : staff.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-12 text-center text-slate-400 font-bold">
                      مفيش قائمة معلمين متسجّلة للمدرسة دي.
                    </td>
                  </tr>
                ) : (
                  staff.map((member) => (
                    <tr key={member._id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="p-5 font-black text-slate-700 text-sm">{member.fullName}</td>
                      <td className="p-5 font-bold text-slate-400 text-xs">
                        {member.subjects.length ? member.subjects.join("، ") : (
                          <span className="text-amber-600">
                            {member.subjectLabel || "—"} (مش مادة في المدرسة)
                          </span>
                        )}
                      </td>
                      <td className="p-5">
                        {member.username ? (
                          <span className="font-mono font-black text-slate-800 tracking-widest">
                            {member.username}
                          </span>
                        ) : (
                          <span className="text-[11px] font-black text-slate-300">
                            لسه مفيش حساب
                          </span>
                        )}
                      </td>
                      <td className="p-5 text-center">
                        {canEdit && member.hasAccount && (
                          <button
                            onClick={() => reissue(member)}
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
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        /* Only the sheet goes on paper — the dashboard around it (sidebar,
           the list below) is hidden and the sheet put back at the top. */
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: absolute; inset: 0 auto auto 0; width: 100%;
            border: none !important; box-shadow: none !important; margin: 0;
          }
          .no-print { display: none !important; }
          body { background: white; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `,
        }}
      />
    </div>
  );
};

export default StaffAccountManager;
