import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BookOpen,
  PlusCircle,
  Edit3,
  Trash2,
  Hash,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
  X,
  Filter,
} from "lucide-react";

const SubjectManagement = () => {
  const [subjects, setSubjects] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 1. State جديد لتخزين الصف الدراسي المختار للفلترة
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

  const token = localStorage.getItem("token");
  const BASE_URL = "http://localhost:5000/api";
  const config = { headers: { Authorization: `Bearer ${token}` } };

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
        axios.get(`${BASE_URL}/subjects`, config),
        axios.get(`${BASE_URL}/grades`, config),
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
      showToast("Failed to connect to server", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
        await axios.put(`${BASE_URL}/subjects/${editingId}`, payload, config);
        showToast("تم تحديث المادة بنجاح", "success");
      } else {
        await axios.post(`${BASE_URL}/subjects`, payload, config);
        showToast("تم إضافة المادة بنجاح", "success");
      }

      setFormData({ name: "", code: "", grade: "" });
      setEditingId(null);
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
      await axios.delete(`${BASE_URL}/subjects/${deleteId}`, config);
      setSubjects(subjects.filter((s) => s._id !== deleteId));
      showToast("Subject deleted successfully", "success");
      setDeleteId(null);
    } catch (err) {
      showToast(err.response?.data?.message || "Delete failed", "error");
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 2. منطق الفلترة: تصفية المصفوفة الأصلية بناءً على الصف المختار
  const filteredSubjects = subjects.filter((sub) => {
    if (!selectedGradeFilter) return true; // إذا لم يتم اختيار صف، اعرض كل المواد
    const subjectGradeId = sub.grade?._id || sub.grade;
    return subjectGradeId === selectedGradeFilter;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans" dir="ltr">
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-5 duration-300">
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

      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="bg-indigo-600 p-4 rounded-3xl text-white shadow-xl shadow-indigo-100">
              <BookOpen size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                Academic Subjects
              </h1>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
                Manage Curriculum & Grades
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 px-5 py-3 rounded-2xl border border-indigo-100">
            <span className="text-indigo-600 font-black text-lg">
              {filteredSubjects?.length || 0}
            </span>
            <span className="text-indigo-400 text-[10px] font-black uppercase">
              {selectedGradeFilter ? "Filtered Subjects" : "Active Subjects"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Form Panel */}
          <div className="lg:col-span-4">
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 sticky top-10">
              <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                {editingId ? (
                  <Edit3 className="text-amber-500" />
                ) : (
                  <PlusCircle className="text-indigo-500" />
                )}
                {editingId ? "Update Details" : "Add New Subject"}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                    Subject Name
                  </label>
                  <input
                    required
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all"
                    placeholder="e.g. Pure Mathematics"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                    Unique Code
                  </label>
                  <div className="relative">
                    <Hash
                      className="absolute left-5 top-5 text-slate-300"
                      size={20}
                    />
                    <input
                      required
                      className="w-full p-5 pl-14 bg-slate-50 rounded-[1.5rem] font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all"
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

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase ml-2 tracking-widest">
                    Target Grade
                  </label>
                  <div className="relative">
                    <Layers
                      className="absolute left-5 top-5 text-slate-300"
                      size={20}
                    />
                    <select
                      required
                      className="w-full p-5 pl-14 bg-slate-50 rounded-[1.5rem] font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
                      value={formData.grade}
                      onChange={(e) =>
                        setFormData({ ...formData, grade: e.target.value })
                      }
                    >
                      <option value="">Select Level...</option>
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
                  className={`w-full py-6 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3 ${
                    editingId
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-slate-900 hover:bg-indigo-600 text-white"
                  }`}
                >
                  {actionLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : editingId ? (
                    "Update Subject"
                  ) : (
                    "Confirm Entry"
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ name: "", code: "", grade: "" });
                    }}
                    className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
                  >
                    Discard Changes
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* List Panel */}
          <div className="lg:col-span-8 space-y-6">
            {/* 3. شريط التصفية (Filter Bar) المضاف حديثاً */}
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 self-start sm:self-center">
                <Filter size={20} className="text-slate-400" />
                <span className="text-sm font-black text-slate-700 uppercase tracking-wider">
                  Filter List
                </span>
              </div>
              <div className="relative w-full sm:w-72">
                <Layers
                  className="absolute left-4 top-4 text-slate-400"
                  size={18}
                />
                <select
                  className="w-full p-3.5 pl-12 bg-slate-50 rounded-xl font-bold text-slate-600 text-sm outline-none border border-slate-100 focus:border-indigo-500 focus:bg-white transition-all appearance-none cursor-pointer"
                  value={selectedGradeFilter}
                  onChange={(e) => setSelectedGradeFilter(e.target.value)}
                >
                  <option value="">All Grades / Levels</option>
                  {grades.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {selectedGradeFilter && (
                  <button
                    onClick={() => setSelectedGradeFilter("")}
                    className="absolute right-4 top-4 text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        Course Information
                      </th>
                      <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        Academic Level
                      </th>
                      <th className="p-8 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan="3" className="p-32 text-center">
                          <Loader2
                            className="animate-spin mx-auto text-indigo-500"
                            size={48}
                          />
                        </td>
                      </tr>
                    ) : filteredSubjects?.length > 0 ? (
                      /* 4. تم تغيير الخريطة لتعمل على المصفوفة المفلترة filteredSubjects بدلاً من الأصلية */
                      filteredSubjects.map((sub) => (
                        <tr
                          key={sub._id}
                          className="group hover:bg-slate-50/50 transition-all"
                        >
                          <td className="p-8">
                            <div className="flex flex-col gap-1">
                              <span className="font-black text-slate-700 text-lg">
                                {sub.name}
                              </span>
                              <span className="text-xs font-black text-indigo-500 tracking-widest">
                                {sub.code}
                              </span>
                            </div>
                          </td>
                          <td className="p-8">
                            <div className="inline-flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                              <span className="text-sm font-black text-slate-600">
                                {sub.grade?.name || "Unassigned"}
                              </span>
                            </div>
                          </td>
                          <td className="p-8">
                            <div className="flex items-center justify-center gap-4">
                              <button
                                onClick={() => startEdit(sub)}
                                className="p-4 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-2xl transition-all"
                              >
                                <Edit3 size={20} />
                              </button>
                              <button
                                onClick={() => setDeleteId(sub._id)}
                                className="p-4 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="p-32 text-center">
                          <div className="opacity-20 flex flex-col items-center gap-4">
                            <BookOpen size={64} />
                            <p className="font-black uppercase tracking-[0.3em] text-sm">
                              No Subjects Found
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                Delete Subject
              </h3>
              <p className="text-sm font-medium text-slate-500">
                Are you sure you want to delete this subject? This will check
                for linked teachers first.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-lg shadow-rose-100 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SubjectManagement;
