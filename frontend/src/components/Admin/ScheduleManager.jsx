import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Calendar,
  Clock,
  User,
  Home,
  Plus,
  Trash2,
  Edit,
  X,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle2,
  Filter,
  BookOpen,
} from "lucide-react";

const SchedulesPage = () => {
  const [schedules, setSchedules] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // حالات الفلترة الجديدة (الصف والفصل)
  const [selectedClassroom, setSelectedClassroom] = useState("");

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({
    teacher: "",
    classroom: "",
    day: "sun",
    startTime: "",
    endTime: "",
  });

  const token = localStorage.getItem("token");
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const BASE_URL = "http://localhost:5000/api";

  const daysMapping = {
    sun: "Sunday",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [schRes, teachRes, classRes] = await Promise.all([
        axios.get(`${BASE_URL}/schedules`, config),
        axios.get(`${BASE_URL}/teacher`, config),
        axios.get(`${BASE_URL}/classrooms`, config),
      ]);
      setSchedules(Array.isArray(schRes.data) ? schRes.data : []);
      setTeachers(teachRes.data.data || []);
      setClassrooms(Array.isArray(classRes.data) ? classRes.data : []);
    } catch (err) {
      showToast("Error loading initial data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setActionLoading(true);
    try {
      if (editingId) {
        await axios.put(`${BASE_URL}/schedules/${editingId}`, formData, config);
        showToast("Session updated successfully", "success");
      } else {
        await axios.post(`${BASE_URL}/schedules`, formData, config);
        showToast("New session added successfully", "success");
      }
      closeModal();
      fetchInitialData();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`${BASE_URL}/schedules/${deleteId}`, config);
      showToast("Session deleted successfully", "success");
      fetchInitialData();
      setDeleteId(null);
    } catch (err) {
      showToast("Failed to delete schedule", "error");
      setDeleteId(null);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setErrorMessage("");
    setFormData({
      teacher: "",
      classroom: "",
      day: "sun",
      startTime: "",
      endTime: "",
    });
  };

  // تصفية الجداول بناءً على الفصل المختار
  const filteredSchedules = selectedClassroom
    ? schedules.filter((s) => s.classroom?._id === selectedClassroom)
    : schedules;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="ltr">
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

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Calendar className="text-indigo-600" size={36} /> Class Schedules
            </h1>
            <p className="text-slate-400 font-medium text-sm mt-1">
              Manage and filter school lectures timeline
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> Add New Session
          </button>
        </div>

        {/* شريط الفلترة المطور (Filter Bar) */}
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 font-bold text-sm bg-slate-50 px-4 py-3 rounded-2xl">
            <Filter size={16} className="text-indigo-500" />
            <span>Filter By Classroom:</span>
          </div>
          <div className="w-full sm:w-72">
            <select
              className="w-full p-3.5 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm transition-all cursor-pointer"
              value={selectedClassroom}
              onChange={(e) => setSelectedClassroom(e.target.value)}
            >
              <option value="">All Classrooms & Grades</option>
              {classrooms.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.grade?.name ? `${c.grade.name} - ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedClassroom && (
            <button
              onClick={() => setSelectedClassroom("")}
              className="text-xs font-bold text-rose-500 hover:bg-rose-50 px-3 py-2 rounded-xl transition-colors"
            >
              Clear Filter
            </button>
          )}
        </div>

        {/* منطقة عرض البيانات (Cards Container) */}
        <div>
          {loading ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 flex justify-center py-40">
              <Loader2 className="animate-spin text-indigo-500" size={48} />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 text-center py-32 text-slate-400 font-bold uppercase tracking-wider">
              No schedules found for this selection.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSchedules.map((s) => (
                <div
                  key={s._id}
                  className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  {/* شريط علوي صغير لتحديد اليوم ملوّن */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-500/10 group-hover:bg-indigo-500 transition-colors" />

                  <div className="space-y-4">
                    {/* معلومات اليوم والفصل */}
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl">
                        {daysMapping[s.day]}
                      </span>
                      <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl text-xs font-bold">
                        <Home size={14} className="text-slate-400" />
                        <span>
                          {s.classroom?.grade?.name} - {s.classroom?.name}
                        </span>
                      </div>
                    </div>

                    {/* المادة والـ Timing */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                          <BookOpen size={16} />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-800 text-base leading-tight">
                            {s.subject?.name || "No Subject Assigned"}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
                            Subject
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                          <Clock size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            {s.startTime} - {s.endTime}
                          </p>
                          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
                            Session Timing
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* المدرس */}
                    <div className="pt-3 border-t border-slate-50 flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-bold text-sm">
                        {s.teacher?.firstName?.charAt(0) || <User size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {s.teacher
                            ? `Mr. ${s.teacher.firstName} ${s.teacher.lastName}`
                            : "Unknown Teacher"}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          Instructor
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* أزرار التحكم أسفل الكارد */}
                  <div className="flex gap-2 pt-5 mt-4 border-t border-slate-50/60">
                    <button
                      onClick={() => {
                        setEditingId(s._id);
                        setFormData({
                          teacher: s.teacher?._id || "",
                          classroom: s.classroom?._id || "",
                          day: s.day,
                          startTime: s.startTime,
                          endTime: s.endTime,
                        });
                        setShowModal(true);
                      }}
                      className="flex-1 py-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
                    >
                      <Edit size={14} /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteId(s._id)}
                      className="py-2.5 px-3 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all flex items-center justify-center text-xs font-bold"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? "Edit Session" : "Add New Session"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 font-bold text-sm">
                <AlertCircle size={18} /> {errorMessage}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 md:grid-cols-2 gap-5"
            >
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Teacher
                </label>
                <select
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 transition-all"
                  value={formData.teacher}
                  onChange={(e) =>
                    setFormData({ ...formData, teacher: e.target.value })
                  }
                >
                  <option value="">Choose a teacher...</option>
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Classroom
                </label>
                <select
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 transition-all"
                  value={formData.classroom}
                  onChange={(e) =>
                    setFormData({ ...formData, classroom: e.target.value })
                  }
                >
                  <option value="">Select class...</option>
                  {classrooms.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.grade?.name ? `${c.grade.name} - ` : ""}
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Day
                </label>
                <select
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 transition-all"
                  value={formData.day}
                  onChange={(e) =>
                    setFormData({ ...formData, day: e.target.value })
                  }
                >
                  {Object.entries(daysMapping).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  value={formData.startTime}
                  onChange={(e) =>
                    setFormData({ ...formData, startTime: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">
                  End Time
                </label>
                <input
                  type="time"
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  value={formData.endTime}
                  onChange={(e) =>
                    setFormData({ ...formData, endTime: e.target.value })
                  }
                />
              </div>
              <button
                disabled={actionLoading}
                className="md:col-span-2 mt-4 py-4 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Save size={20} />
                )}
                {editingId ? "Update Schedule" : "Confirm & Save"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-6 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                Delete Session
              </h3>
              <p className="text-sm font-medium text-slate-500">
                Are you sure you want to delete this schedule slot? This action
                cannot be undone.
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

export default SchedulesPage;
