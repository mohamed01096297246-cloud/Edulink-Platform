import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Plus,
  Edit3,
  Trash2,
  DoorOpen,
  GraduationCap,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Filter,
  X,
  Save,
} from "lucide-react";

const ClassroomManagement = () => {
  const [classrooms, setClassrooms] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // State للفلترة بناءً على الصف الدراسي
  const [selectedFilterGrade, setSelectedFilterGrade] = useState("");

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    grade: "",
    academicYear: "",
    capacity: 30,
  });
  const [editingId, setEditingId] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [classRes, gradeRes] = await Promise.all([
          API.get("/classrooms"),
          API.get("/grades"),
        ]);
        setClassrooms(classRes.data);
        setGrades(gradeRes.data.data || []);
      } catch (err) {
        showToast("فشل تحميل الفصول أو المراحل", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editingId) {
        const res = await API.put(`/classrooms/${editingId}`, formData);
        showToast(
          res.data.message || "تم تحديث الفصل بنجاح",
          "success",
        );
      } else {
        const res = await API.post("/classrooms", formData);
        showToast(
          res.data.message || "تم إنشاء الفصل بنجاح",
          "success",
        );
      }
      closeModal();
      refreshData();
    } catch (err) {
      showToast(err.response?.data?.message || "حدث خطأ ما", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await API.delete(`/classrooms/${deleteId}`);
      showToast(
        res.data.message || "تم حذف الفصل بنجاح",
        "success",
      );
      refreshData();
      setDeleteId(null);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل الحذف", "error");
      setDeleteId(null);
    }
  };

  const refreshData = async () => {
    const res = await API.get("/classrooms");
    setClassrooms(res.data);
  };

  const startEdit = (cls) => {
    setEditingId(cls._id);
    setFormData({
      name: cls.name,
      grade: cls.grade?._id || cls.grade,
      academicYear: cls.academicYear,
      capacity: cls.capacity,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: "", grade: "", academicYear: "", capacity: 30 });
  };

  // تصفية الفصول في فرونت-إند بناءً على الصف المختار
  const filteredClassrooms = classrooms.filter((cls) => {
    if (!selectedFilterGrade) return true; // لو مش مختار حاجة اعرض كله
    const classroomGradeId = cls.grade?._id || cls.grade;
    return classroomGradeId === selectedFilterGrade;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 font-sans" dir="rtl">
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

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <DoorOpen size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">
                إدارة الفصول
              </h1>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest italic">
                إدارة المساحات والتسجيل
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> إنشاء فصل جديد
          </button>
        </div>

        {/* قسم الفلتر */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Filter size={18} className="text-indigo-500" />
            <span className="text-xs font-black uppercase tracking-wider">
              فلترة حسب المرحلة:
            </span>
          </div>
          <div className="w-full sm:w-64">
            <select
              className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
              value={selectedFilterGrade}
              onChange={(e) => setSelectedFilterGrade(e.target.value)}
            >
              <option value="">كل المراحل (عرض الكل)</option>
              {grades.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* الجدول الرئيسي */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    بيانات الفصل
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    السعة
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
                ) : filteredClassrooms.length === 0 ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="p-16 text-center text-slate-400 font-bold"
                    >
                      {classrooms.length === 0
                        ? 'لا يوجد فصول بعد. اضغط "إنشاء فصل جديد" لإضافة أول فصل.'
                        : "لا يوجد فصول لهذه المرحلة الدراسية."}
                    </td>
                  </tr>
                ) : (
                  filteredClassrooms.map((cls) => (
                    <tr
                      key={cls._id}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="p-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-700 uppercase">
                            {cls.name}
                          </span>
                          <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-1">
                            <GraduationCap size={12} /> {cls.grade?.name} (
                            {cls.academicYear})
                          </span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-600">
                            {cls.currentStudents || 0} / {cls.capacity}
                          </span>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500"
                              style={{
                                width: `${((cls.currentStudents || 0) / cls.capacity) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(cls)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            onClick={() => setDeleteId(cls._id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
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
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? "تعديل الفصل" : "إنشاء فصل جديد"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  اسم الفصل
                </label>
                <input
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  placeholder="مثال: فصل أ-1"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  المرحلة الدراسية
                </label>
                <select
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all appearance-none"
                  value={formData.grade}
                  onChange={(e) =>
                    setFormData({ ...formData, grade: e.target.value })
                  }
                >
                  <option value="">اختر المرحلة</option>
                  {grades.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  السنة الدراسية
                </label>
                <input
                  required
                  placeholder="2025/2026"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  value={formData.academicYear}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      academicYear: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  السعة
                </label>
                <input
                  type="number"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  value={formData.capacity}
                  onChange={(e) =>
                    setFormData({ ...formData, capacity: e.target.value })
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
                {editingId ? "تحديث الفصل" : "حفظ الفصل"}
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
                حذف الفصل
              </h3>
              <p className="text-sm font-medium text-slate-500">
                هل أنت متأكد؟ العملية هتفشل لو فيه طلاب أو جداول مرتبطة بالفصل.
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
export default ClassroomManagement;
