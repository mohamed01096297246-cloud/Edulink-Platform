import React, { useState, useEffect, useMemo } from "react";
import API from "../../api/axios";
import {
  Wallet,
  Search,
  Plus,
  Trash2,
  CreditCard,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";

// Fee/installment tracking — the module every private school actually
// asks for first. A student can have several fee records (tuition,
// transport, books, ...); each accumulates payments until it's settled.
const FeeManager = () => {
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [payModal, setPayModal] = useState({ show: false, fee: null });
  const [deleteModal, setDeleteModal] = useState({ show: false, fee: null });
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [feeForm, setFeeForm] = useState({
    student: "",
    title: "",
    academicYear: "",
    totalAmount: "",
    discount: "0",
    dueDate: "",
  });

  const [payForm, setPayForm] = useState({ amount: "", method: "cash", note: "" });

  const showToastMessage = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [feesRes, studentsRes, summaryRes] = await Promise.all([
        API.get("/fees"),
        API.get("/students"),
        API.get("/fees/summary"),
      ]);
      setFees(feesRes.data.data || []);
      setStudents(studentsRes.data.data || []);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error("Fetch Error:", err);
      showToastMessage("فشل تحميل البيانات المالية", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetFeeForm = () =>
    setFeeForm({ student: "", title: "", academicYear: "", totalAmount: "", discount: "0", dueDate: "" });

  const handleAddFee = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await API.post("/fees", {
        ...feeForm,
        totalAmount: Number(feeForm.totalAmount),
        discount: Number(feeForm.discount || 0),
      });
      showToastMessage("تم إنشاء سجل المصروفات بنجاح");
      setShowAddModal(false);
      resetFeeForm();
      fetchData();
    } catch (err) {
      showToastMessage(err.response?.data?.message || err.response?.data?.error || "حدث خطأ ما", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openPayModal = (fee) => {
    setPayForm({ amount: "", method: "cash", note: "" });
    setPayModal({ show: true, fee });
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await API.post(`/fees/${payModal.fee._id}/payments`, {
        ...payForm,
        amount: Number(payForm.amount),
      });
      showToastMessage("تم تسجيل الدفعة بنجاح");
      setPayModal({ show: false, fee: null });
      fetchData();
    } catch (err) {
      showToastMessage(err.response?.data?.message || "حدث خطأ ما", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    try {
      await API.delete(`/fees/${deleteModal.fee._id}`);
      showToastMessage("تم حذف سجل المصروفات بنجاح");
      setDeleteModal({ show: false, fee: null });
      fetchData();
    } catch (err) {
      showToastMessage(err.response?.data?.message || "حدث خطأ ما", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const paidAmount = (fee) => fee.payments.reduce((sum, p) => sum + p.amount, 0);
  const owedAmount = (fee) => fee.totalAmount - fee.discount;

  const filteredFees = useMemo(() => {
    return fees.filter((fee) => {
      const matchesStatus = statusFilter === "all" || fee.status === statusFilter;
      const studentName = fee.student
        ? `${fee.student.firstName} ${fee.student.lastName}`
        : "";
      const matchesSearch = `${studentName} ${fee.title}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [fees, statusFilter, searchTerm]);

  const statusStyle = {
    paid: "bg-emerald-50 text-emerald-600",
    partial: "bg-amber-50 text-amber-600",
    unpaid: "bg-rose-50 text-rose-600",
  };
  const statusLabel = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      {toast.show && (
        <div
          className={`fixed top-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border text-sm font-bold ${toast.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-rose-50 border-rose-100 text-rose-800"}`}
        >
          {toast.type === "success" ? <CheckCircle2 className="text-emerald-500" size={20} /> : <XCircle className="text-rose-500" size={20} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast({ show: false, message: "", type: "success" })} className="mr-2 p-1 hover:bg-black/5 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Wallet className="text-emerald-600" size={36} /> الأقساط والمصروفات
            </h1>
            <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
              المصروفات والأقساط والتحصيل
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            <Plus size={20} /> سجل مصروفات جديد
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard title="إجمالي الفواتير" value={summary?.totalBilled} icon={<Wallet />} color="blue" />
          <SummaryCard title="المحصّل" value={summary?.totalCollected} icon={<TrendingUp />} color="emerald" />
          <SummaryCard title="المتبقي" value={summary?.totalOutstanding} icon={<TrendingDown />} color="amber" />
          <SummaryCard title="حسابات متأخرة" value={summary?.defaultersCount} icon={<AlertCircle />} color="rose" isCount />
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex flex-col lg:flex-row gap-6 justify-between">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto">
              {["all", "unpaid", "partial", "paid"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-6 py-3 rounded-xl text-xs font-black transition-all whitespace-nowrap ${statusFilter === s ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {s === "all" ? "الكل" : statusLabel[s]}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-96">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="ابحث باسم الطالب أو عنوان الرسوم..."
                className="w-full pr-12 pl-4 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 ring-emerald-500/20 font-bold text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50/50 text-slate-400 text-xs font-black uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">الطالب</th>
                  <th className="px-6 py-4">الرسوم</th>
                  <th className="px-6 py-4">تاريخ الاستحقاق</th>
                  <th className="px-6 py-4">المدفوع / الإجمالي</th>
                  <th className="px-6 py-4">الحالة</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-20 text-center">
                      <Loader2 className="animate-spin mx-auto text-emerald-500" size={40} />
                    </td>
                  </tr>
                ) : filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-20 text-center text-slate-400 font-bold">
                      لا يوجد سجلات مصروفات بعد.
                    </td>
                  </tr>
                ) : (
                  filteredFees.map((fee) => (
                    <tr key={fee._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5">
                        <p className="font-black text-slate-800">
                          {fee.student ? `${fee.student.firstName} ${fee.student.lastName}` : "—"}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{fee.academicYear}</p>
                      </td>
                      <td className="px-6 py-5 font-bold text-slate-600 text-sm">{fee.title}</td>
                      <td className="px-6 py-5 font-bold text-slate-600 text-xs">
                        {new Date(fee.dueDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-5 font-bold text-slate-700 text-sm tabular-nums">
                        {paidAmount(fee).toLocaleString()} / {owedAmount(fee).toLocaleString()}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusStyle[fee.status]}`}>
                          {statusLabel[fee.status]}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          {fee.status !== "paid" && (
                            <button
                              onClick={() => openPayModal(fee)}
                              className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="تسجيل دفعة"
                            >
                              <CreditCard size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteModal({ show: true, fee })}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-black flex items-center gap-2">
                <Wallet /> سجل مصروفات جديد
              </h2>
              <button disabled={actionLoading} onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>
            <form onSubmit={handleAddFee} className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="md:col-span-2 lg:col-span-3 space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">الطالب</label>
                <select
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm"
                  value={feeForm.student}
                  onChange={(e) => setFeeForm({ ...feeForm, student: e.target.value })}
                >
                  <option value="">اختر طالبًا</option>
                  {students.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <FormInput label="عنوان الرسوم" placeholder="مثال: مصروفات الترم الأول" value={feeForm.title} onChange={(v) => setFeeForm({ ...feeForm, title: v })} />
              <FormInput label="السنة الدراسية" placeholder="مثال: 2025/2026" value={feeForm.academicYear} onChange={(v) => setFeeForm({ ...feeForm, academicYear: v })} />
              <FormInput label="المبلغ الإجمالي" type="number" min="0" value={feeForm.totalAmount} onChange={(v) => setFeeForm({ ...feeForm, totalAmount: v })} />
              <FormInput label="الخصم" type="number" min="0" value={feeForm.discount} onChange={(v) => setFeeForm({ ...feeForm, discount: v })} />
              <FormInput label="تاريخ الاستحقاق" type="date" value={feeForm.dueDate} onChange={(v) => setFeeForm({ ...feeForm, dueDate: v })} />
              <button
                disabled={actionLoading}
                className="md:col-span-2 lg:col-span-3 mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="animate-spin" size={20} /> : <><Plus size={20} /> إنشاء سجل المصروفات</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {payModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-black flex items-center gap-2">
                <CreditCard /> تسجيل دفعة
              </h2>
              <button disabled={actionLoading} onClick={() => setPayModal({ show: false, fee: null })} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-8 space-y-4">
              <p className="text-sm font-bold text-slate-500">
                المتبقي من <span className="text-slate-800">{payModal.fee.title}</span>:{" "}
                <span className="text-emerald-600 tabular-nums">
                  {(owedAmount(payModal.fee) - paidAmount(payModal.fee)).toLocaleString()}
                </span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput label="المبلغ" type="number" min="1" required value={payForm.amount} onChange={(v) => setPayForm({ ...payForm, amount: v })} />
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">طريقة الدفع</label>
                  <select
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm"
                    value={payForm.method}
                    onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                  >
                    <option value="cash">نقدًا</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="card">بطاقة</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
              </div>
              <FormInput label="ملاحظة (اختياري)" required={false} value={payForm.note} onChange={(v) => setPayForm({ ...payForm, note: v })} />
              <button
                disabled={actionLoading}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="animate-spin" size={20} /> : "تأكيد الدفعة"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">حذف سجل المصروفات</h3>
              <p className="text-slate-400 font-medium text-sm mt-2">
                هل أنت متأكد من حذف{" "}
                <strong className="text-slate-700 font-bold">{deleteModal.fee?.title}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                disabled={actionLoading}
                onClick={() => setDeleteModal({ show: false, fee: null })}
                className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200"
              >
                إلغاء
              </button>
              <button
                disabled={actionLoading}
                onClick={confirmDelete}
                className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-100 flex justify-center items-center gap-2"
              >
                {actionLoading ? <Loader2 className="animate-spin" size={20} /> : "نعم، احذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ title, value, icon, color, isCount }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };
  return (
    <div className="p-6 rounded-[2rem] border-2 bg-white flex items-center gap-5 shadow-sm">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
          {value === undefined || value === null ? "—" : isCount ? value : value.toLocaleString()}
        </p>
      </div>
    </div>
  );
};

const FormInput = ({ label, required = true, ...props }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-black text-slate-400 mr-2 uppercase tracking-widest">{label}</label>
    <input
      required={required}
      {...props}
      onChange={(e) => props.onChange(e.target.value)}
      className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm transition-all"
    />
  </div>
);

export default FeeManager;
