import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Plus,
  Edit3,
  Trash2,
  School,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Save,
} from "lucide-react";

const GradeManagement = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);

  const [formData, setFormData] = useState({ name: "", academicYear: "" });
  const [editingId, setEditingId] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  const fetchGrades = async () => {
    setLoading(true);
    try {
      const res = await API.get("/grades");
      if (res.data.success) {
        setGrades(res.data.data);
      }
    } catch (err) {
      showToast("فشل تحميل البيانات", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrades();
  }, []);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: "", academicYear: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editingId) {
        const res = await API.put(`/grades/${editingId}`, formData);
        if (res.data.success)
          showToast("تم تحديث المرحلة بنجاح", "success");
      } else {
        const res = await API.post("/grades", formData);
        if (res.data.success) showToast("تم إضافة المرحلة بنجاح", "success");
      }
      closeModal();
      fetchGrades();
    } catch (err) {
      showToast(err.response?.data?.message || "فشلت العملية", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await API.delete(`/grades/${deleteId}`);
      if (res.data.success) {
        showToast("تم الحذف بنجاح", "success");
        fetchGrades();
        setDeleteId(null);
      }
    } catch (err) {
      showToast(
        "لا يمكن الحذف. قد تكون هذه المرحلة مرتبطة ببيانات أخرى.",
        "error",
      );
      setDeleteId(null);
    }
  };

  const startEdit = (grade) => {
    setEditingId(grade._id);
    setFormData({ name: grade.name, academicYear: grade.academicYear });
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans" dir="rtl">
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-5 duration-300">
          <div
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : (
              <AlertCircle size={18} className="text-rose-600" />
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-lg">
              <School size={32} />
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-black text-slate-800">
                إدارة المراحل الدراسية
              </h1>
              <p className="text-slate-500 font-bold text-xs uppercase italic tracking-wider">
                إعداد المراحل والسنوات الدراسية
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> إضافة مرحلة جديدة
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    اسم المرحلة
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    السنة الدراسية
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="3" className="p-20 text-center">
                      <Loader2 className="animate-spin mx-auto text-indigo-500" size={40} />
                    </td>
                  </tr>
                ) : grades.length === 0 ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="p-16 text-center text-slate-400 font-bold"
                    >
                      لا يوجد مراحل مسجّلة بعد. اضغط "إضافة مرحلة جديدة" لإضافة أول مرحلة.
                    </td>
                  </tr>
                ) : (
                  grades.map((g) => (
                    <tr
                      key={g._id}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="p-6 font-black text-slate-700">
                        {g.name}
                      </td>
                      <td className="p-6">
                        <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black tracking-tight">
                          {g.academicYear}
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(g)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                            title="تعديل"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            onClick={() => setDeleteId(g._id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="حذف"
                          >
                            <Trash2 size={18} />
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? "تعديل المرحلة" : "إضافة مرحلة جديدة"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 md:grid-cols-2 gap-5"
            >
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 mr-2 uppercase">
                  اسم المرحلة
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: الصف الأول الابتدائي"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 mr-2 uppercase">
                  السنة الدراسية
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: 2025/2026"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  value={formData.academicYear}
                  onChange={(e) =>
                    setFormData({ ...formData, academicYear: e.target.value })
                  }
                />
              </div>

              <button
                disabled={actionLoading}
                className="md:col-span-2 mt-2 py-4 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Save size={20} />
                )}
                {editingId ? "تحديث المرحلة" : "حفظ المرحلة"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                حذف المرحلة
              </h3>
              <p className="text-sm font-medium text-slate-500">
                هل أنت متأكد من حذف هذه المرحلة؟ لا يمكن التراجع عن هذا الإجراء لو مرتبطة بسجلات أخرى.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-lg shadow-rose-100 transition-all"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradeManagement;
