import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  Hash,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
  X,
  Filter,
  Save,
} from "lucide-react";

const SubjectManagement = () => {
  const [subjects, setSubjects] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // State جديد لتخزين الصف الدراسي المختار للفلترة
  const [selectedGradeFilter, setSelectedGradeFilter] = useState("");

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    grade: "",
  });
  const [editingId, setEditingId] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  // Fetch Initial Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [subRes, gradeRes] = await Promise.all([
        API.get("/subjects"),
        API.get("/grades"),
      ]);

      const fetchedSubjects = Array.isArray(subRes.data)
        ? subRes.data
        : subRes.data?.subject || [];
      const fetchedGrades = Array.isArray(gradeRes.data)
        ? gradeRes.data
        : gradeRes.data?.data || [];

      setSubjects(fetchedSubjects);
      setGrades(fetchedGrades);
    } catch (err) {
      showToast("فشل الاتصال بالسيرفر", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: "", code: "", grade: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);

    const payload = {
      name: formData.name,
      code: formData.code.trim().toUpperCase(),
      grade: formData.grade,
    };

    try {
      if (editingId) {
        await API.put(`/subjects/${editingId}`, payload);
        showToast("تم تحديث المادة بنجاح", "success");
      } else {
        await API.post("/subjects", payload);
        showToast("تم إضافة المادة بنجاح", "success");
      }

      closeModal();
      fetchData();
    } catch (err) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "فشلت العملية";
      showToast(errorMsg, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await API.delete(`/subjects/${deleteId}`);
      setSubjects(subjects.filter((s) => s._id !== deleteId));
      showToast("تم حذف المادة بنجاح", "success");
      setDeleteId(null);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل الحذف", "error");
      setDeleteId(null);
    }
  };

  const startEdit = (subject) => {
    setEditingId(subject._id);
    setFormData({
      name: subject.name,
      code: subject.code,
      grade: subject.grade?._id || subject.grade,
    });
    setShowModal(true);
  };

  // منطق الفلترة: تصفية المصفوفة الأصلية بناءً على الصف المختار
  const filteredSubjects = subjects.filter((sub) => {
    if (!selectedGradeFilter) return true; // إذا لم يتم اختيار صف، اعرض كل المواد
    const subjectGradeId = sub.grade?._id || sub.grade;
    return subjectGradeId === selectedGradeFilter;
  });

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
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <AlertCircle size={20} className="text-rose-600" />
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="bg-indigo-600 p-4 rounded-3xl text-white shadow-xl shadow-indigo-100">
              <BookOpen size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                المواد الدراسية
              </h1>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
                إدارة المناهج والمراحل
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> إضافة مادة جديدة
          </button>
        </div>

        {/* شريط التصفية */}
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 self-start sm:self-center">
            <Filter size={20} className="text-slate-400" />
            <span className="text-sm font-black text-slate-700 uppercase tracking-wider">
              فلترة القائمة
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Layers
              className="absolute right-4 top-4 text-slate-400"
              size={18}
            />
            <select
              className="w-full p-3.5 pr-12 bg-slate-50 rounded-xl font-bold text-slate-600 text-sm outline-none border border-slate-100 focus:border-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
              value={selectedGradeFilter}
              onChange={(e) => setSelectedGradeFilter(e.target.value)}
            >
              <option value="">كل المراحل</option>
              {grades.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
            {selectedGradeFilter && (
              <button
                onClick={() => setSelectedGradeFilter("")}
                className="absolute left-4 top-4 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    بيانات المادة
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    المرحلة الدراسية
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
                      <Loader2
                        className="animate-spin mx-auto text-indigo-500"
                        size={40}
                      />
                    </td>
                  </tr>
                ) : filteredSubjects?.length > 0 ? (
                  filteredSubjects.map((sub) => (
                    <tr
                      key={sub._id}
                      className="group hover:bg-indigo-50/30 transition-all"
                    >
                      <td className="p-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-black text-slate-700 text-lg">
                            {sub.name}
                          </span>
                          <span className="text-xs font-black text-indigo-500 tracking-widest">
                            {sub.code}
                          </span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="inline-flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                          <span className="text-sm font-black text-slate-600">
                            {sub.grade?.name || "غير محدد"}
                          </span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(sub)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            onClick={() => setDeleteId(sub._id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="p-16 text-center text-slate-400 font-bold">
                      {subjects.length === 0
                        ? 'لا يوجد مواد بعد. اضغط "إضافة مادة جديدة" لإضافة أول مادة.'
                        : "لا يوجد مواد مطابقة لهذا الفلتر."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? "تحديث بيانات المادة" : "إضافة مادة جديدة"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-black text-slate-400 mr-2 uppercase">
                  اسم المادة
                </label>
                <input
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  placeholder="مثال: رياضيات بحتة"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 mr-2 uppercase">
                  الكود المميز
                </label>
                <div className="relative">
                  <Hash
                    className="absolute right-4 top-4 text-slate-300"
                    size={18}
                  />
                  <input
                    required
                    className="w-full p-4 pr-12 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                    placeholder="MATH-01"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 mr-2 uppercase">
                  المرحلة الدراسية
                </label>
                <div className="relative">
                  <Layers
                    className="absolute right-4 top-4 text-slate-300"
                    size={18}
                  />
                  <select
                    required
                    className="w-full p-4 pr-12 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all appearance-none cursor-pointer"
                    value={formData.grade}
                    onChange={(e) =>
                      setFormData({ ...formData, grade: e.target.value })
                    }
                  >
                    <option value="">اختر المرحلة...</option>
                    {grades.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name} - {g.academicYear}
                      </option>
                    ))}
                  </select>
                </div>
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
                {editingId ? "تحديث المادة" : "تأكيد الإضافة"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                حذف المادة
              </h3>
              <p className="text-sm font-medium text-slate-500">
                هل أنت متأكد من حذف هذه المادة؟ هيتم التحقق أولًا من وجود معلمين مرتبطين بيها.
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
export default SubjectManagement;
