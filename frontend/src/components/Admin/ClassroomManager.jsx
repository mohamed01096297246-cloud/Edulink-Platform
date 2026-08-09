import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Users,
  PlusCircle,
  Edit3,
  Trash2,
  DoorOpen,
  GraduationCap,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter, // تم إضافة أيقونة الفلتر
} from "lucide-react";

const ClassroomManagement = () => {
  const [classrooms, setClassrooms] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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

  const token = localStorage.getItem("token");
  const BASE_URL = "http://localhost:5000/api";
  const config = { headers: { Authorization: `Bearer ${token}` } };

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
          axios.get(`${BASE_URL}/classrooms`, config),
          axios.get(`${BASE_URL}/grades`, config),
        ]);
        setClassrooms(classRes.data);
        setGrades(gradeRes.data.data || []);
      } catch (err) {
        showToast("Failed to fetch classrooms or grades", "error");
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
        const res = await axios.put(
          `${BASE_URL}/classrooms/${editingId}`,
          formData,
          config,
        );
        showToast(
          res.data.message || "Classroom updated successfully",
          "success",
        );
      } else {
        const res = await axios.post(
          `${BASE_URL}/classrooms`,
          formData,
          config,
        );
        showToast(
          res.data.message || "Classroom created successfully",
          "success",
        );
      }
      resetForm();
      refreshData();
    } catch (err) {
      showToast(err.response?.data?.message || "Something went wrong", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await axios.delete(
        `${BASE_URL}/classrooms/${deleteId}`,
        config,
      );
      showToast(
        res.data.message || "Classroom deleted successfully",
        "success",
      );
      refreshData();
      setDeleteId(null);
    } catch (err) {
      showToast(err.response?.data?.message || "Delete failed", "error");
      setDeleteId(null);
    }
  };

  const refreshData = async () => {
    const res = await axios.get(`${BASE_URL}/classrooms`, config);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setFormData({ name: "", grade: "", academicYear: "", capacity: 30 });
    setEditingId(null);
  };

  // تصفية الفصول في فرونت-إند بناءً على الصف المختار
  const filteredClassrooms = classrooms.filter((cls) => {
    if (!selectedFilterGrade) return true; // لو مش مختار حاجة اعرض كله
    const classroomGradeId = cls.grade?._id || cls.grade;
    return classroomGradeId === selectedFilterGrade;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 font-sans" dir="ltr">
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
        <div className="flex items-center gap-4 border-b pb-6">
          <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-100">
            <DoorOpen size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">
              Classrooms Hub
            </h1>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest italic">
              Space & Enrollment Management
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 sticky top-10">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                {editingId ? (
                  <Edit3 size={20} className="text-amber-500" />
                ) : (
                  <PlusCircle size={20} className="text-blue-500" />
                )}
                {editingId ? "Edit Classroom" : "Create Classroom"}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                    Class Name
                  </label>
                  <input
                    required
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-blue-500 transition-all"
                    placeholder="e.g. Room A-1"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                    Grade Level
                  </label>
                  <select
                    required
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-blue-500 transition-all appearance-none"
                    value={formData.grade}
                    onChange={(e) =>
                      setFormData({ ...formData, grade: e.target.value })
                    }
                  >
                    <option value="">Select Grade</option>
                    {grades.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Academic Year
                    </label>
                    <input
                      required
                      placeholder="2025/2026"
                      className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-blue-500 transition-all"
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
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      Capacity
                    </label>
                    <input
                      type="number"
                      className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-blue-500 transition-all"
                      value={formData.capacity}
                      onChange={(e) =>
                        setFormData({ ...formData, capacity: e.target.value })
                      }
                    />
                  </div>
                </div>

                <button
                  disabled={actionLoading}
                  className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 ${
                    editingId
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {actionLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : editingId ? (
                    "Update Classroom"
                  ) : (
                    "Save Classroom"
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full text-[10px] font-black text-slate-400 uppercase hover:text-rose-500 transition-colors"
                  >
                    Cancel Edit
                  </button>
                )}
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {/* قسم الفلتر الجديد */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Filter size={18} className="text-blue-500" />
                <span className="text-xs font-black uppercase tracking-wider">
                  Filter by Grade:
                </span>
              </div>
              <div className="w-full sm:w-64">
                <select
                  className="w-full p-3 bg-slate-50 rounded-xl font-bold text-sm text-slate-700 outline-none border-2 border-transparent focus:border-blue-500 transition-all"
                  value={selectedFilterGrade}
                  onChange={(e) => setSelectedFilterGrade(e.target.value)}
                >
                  <option value="">All Grades (Show All)</option>
                  {grades.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* الجدول الرئيسي */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Classroom Details
                      </th>
                      <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Capacity
                      </th>
                      <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan="3" className="p-20 text-center">
                          <Loader2 className="animate-spin mx-auto text-blue-500" />
                        </td>
                      </tr>
                    ) : filteredClassrooms.length === 0 ? (
                      <tr>
                        <td
                          colSpan="3"
                          className="p-12 text-center text-sm font-bold text-slate-400 italic"
                        >
                          No classrooms found for this grade level.
                        </td>
                      </tr>
                    ) : (
                      filteredClassrooms.map((cls) => (
                        <tr
                          key={cls._id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="p-5">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-700 uppercase">
                                {cls.name}
                              </span>
                              <span className="text-[10px] font-bold text-blue-500 flex items-center gap-1">
                                <GraduationCap size={12} /> {cls.grade?.name} (
                                {cls.academicYear})
                              </span>
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-600">
                                {cls.currentStudents || 0} / {cls.capacity}
                              </span>
                              <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                <div
                                  className="h-full bg-blue-500"
                                  style={{
                                    width: `${((cls.currentStudents || 0) / cls.capacity) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                onClick={() => startEdit(cls)}
                                className="p-2 text-slate-400 hover:text-amber-500 transition-colors"
                              >
                                <Edit3 size={18} />
                              </button>
                              <button
                                onClick={() => setDeleteId(cls._id)}
                                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
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
        </div>
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                Delete Classroom
              </h3>
              <p className="text-sm font-medium text-slate-500">
                Are you sure? This will fail if there are linked students or
                schedules.
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
export default ClassroomManagement;
