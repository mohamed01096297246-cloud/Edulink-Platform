import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BookOpen,
  Calendar,
  Hash,
  Award,
  PlusCircle,
  Loader2,
  FileText,
  AlertCircle,
  Edit,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";

const TeacherHomework = ({ grades, loading: gradesLoading }) => {
  const [formData, setFormData] = useState({
    title: "",
    pageNumber: "",
    totalMarks: "",
    dueDate: "",
    grade: "",
  });

  const [homeworks, setHomeworks] = useState([]); // مصفوفة لتخزين الواجبات المجلوبة
  const [fetchingHomeworks, setFetchingHomeworks] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null); // تخزين ID الواجب الجاري تعديله

  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api/homework";

  useEffect(() => {
    fetchHomeworks();
  }, []);

  const fetchHomeworks = async () => {
    try {
      setFetchingHomeworks(true);
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data && response.data.success) {
        setHomeworks(response.data.data || response.data.homeworks || []);
      } else {
        setHomeworks(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      console.error("Failed to fetch homeworks:", err);
      toast.error("Failed to load existing homeworks.");
    } finally {
      setFetchingHomeworks(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.grade)
      return toast.error("Please select a Grade level first.");
    try {
      setSubmitting(true);
      if (editingId) {
        const response = await axios.put(`${API_URL}/${editingId}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success(
          response.data.message || "Homework updated successfully!",
        );
        setEditingId(null);
      } else {
        const response = await axios.post(API_URL, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success(
          response.data.message || "Homework distributed successfully!",
        );
      }
      setFormData({
        title: "",
        pageNumber: "",
        totalMarks: "",
        dueDate: "",
        grade: "",
      });
      fetchHomeworks();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Failed to save homework";
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };


  const handleEditClick = (hw) => {
    setEditingId(hw._id);
    const formattedDate = hw.dueDate
      ? new Date(hw.dueDate).toISOString().split("T")[0]
      : "";

    setFormData({
      title: hw.title || "",
      pageNumber: hw.pageNumber || "",
      totalMarks: hw.totalMarks || "",
      dueDate: formattedDate,
      grade: hw.grade?._id || hw.grade || "", 
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      title: "",
      pageNumber: "",
      totalMarks: "",
      dueDate: "",
      grade: "",
    });
  };

  const handleDeleteClick = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this homework assignment?",
      )
    )
      return;

    try {
      const response = await axios.delete(`${API_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(response.data.message || "Homework deleted successfully!");
      setHomeworks(homeworks.filter((hw) => hw._id !== id));
      if (editingId === id) {
        handleCancelEdit();
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Failed to delete homework";
      toast.error(errorMsg);
    }
  };

  if (gradesLoading)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin mb-4" size={40} />
        <p className="font-bold tracking-tight">Loading Academic Data...</p>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <BookOpen size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              {editingId ? "Modify Homework Assignment" : "Assign New Homework"}
            </h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">
              {editingId
                ? "Updating existing parameters"
                : "Broadcast to all classrooms in a grade"}
            </p>
          </div>
        </div>
        {editingId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 text-xs font-black rounded-xl hover:bg-rose-100 transition-all"
          >
            <XCircle size={14} /> Cancel Edit
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 space-y-8"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
              <AlertCircle size={14} /> Target Grade Level
            </label>
            <select
              name="grade"
              value={formData.grade}
              onChange={handleChange}
              required
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all appearance-none"
            >
              <option value="">Select Grade</option>
              {grades?.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
              <FileText size={14} /> Homework Title
            </label>
            <input
              type="text"
              name="title"
              placeholder="e.g. Algebra Basics"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
              <Hash size={14} /> Page Number (Optional)
            </label>
            <input
              type="text"
              name="pageNumber"
              placeholder="e.g. 45-47"
              value={formData.pageNumber}
              onChange={handleChange}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
              <Award size={14} /> Total Marks
            </label>
            <input
              type="number"
              name="totalMarks"
              placeholder="e.g. 10"
              value={formData.totalMarks}
              onChange={handleChange}
              required
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none"
            />
          </div>

          <div className="space-y-3 md:col-span-2">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
              <Calendar size={14} /> Submission Deadline
            </label>
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              required
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`w-full text-white py-5 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 transition-all shadow-xl disabled:opacity-50 ${
            editingId
              ? "bg-amber-500 hover:bg-amber-600 shadow-amber-100"
              : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100"
          }`}
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={24} />
          ) : editingId ? (
            <>
              <Edit size={24} />
              Update Homework Parameters
            </>
          ) : (
            <>
              <PlusCircle size={24} />
              Distribute Homework
            </>
          )}
        </button>
      </form>

      <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
        <div>
          <h3 className="text-lg font-black text-slate-800">
            Active Homework Directory
          </h3>
          <p className="text-slate-400 text-xs font-bold mt-0.5 uppercase tracking-wider">
            Review, edit, or remove assignments currently in system database
          </p>
        </div>

        {fetchingHomeworks ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <Loader2 className="animate-spin text-indigo-500" size={28} />
            <span className="text-xs font-bold">
              Synchronizing homework records...
            </span>
          </div>
        ) : homeworks.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {homeworks.map((hw) => {
              const formattedDeadline = hw.dueDate
                ? new Date(hw.dueDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "No deadline";

              return (
                <div
                  key={hw._id}
                  className={`p-5 rounded-2xl border transition-all flex flex-wrap items-center justify-between gap-4 ${
                    editingId === hw._id
                      ? "bg-amber-50/40 border-amber-200 ring-2 ring-amber-500/10"
                      : "bg-slate-50/50 border-slate-100 hover:bg-white hover:border-slate-200"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800">
                        {hw.title}
                      </span>
                      <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase tracking-wider">
                        {hw.grade?.name || "Grade level"}
                      </span>
                      {hw.pageNumber && (
                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full">
                          Pg. {hw.pageNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                      <span className="flex items-center gap-1 text-rose-500/90">
                        <Calendar size={12} /> Due: {formattedDeadline}
                      </span>
                      <span>Marks: {hw.totalMarks} pts</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditClick(hw)}
                      className="p-2.5 bg-white text-slate-500 border border-slate-100 rounded-xl hover:text-amber-600 hover:border-amber-100 hover:bg-amber-50/30 transition-all shadow-sm"
                      title="Edit Assignment"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(hw._id)}
                      className="p-2.5 bg-white text-slate-500 border border-slate-100 rounded-xl hover:text-rose-600 hover:border-rose-100 hover:bg-rose-50/30 transition-all shadow-sm"
                      title="Delete Assignment"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-slate-200 rounded-2xl text-slate-300 gap-2">
            <FileText size={36} className="text-slate-300" />
            <span className="text-xs font-bold text-slate-400">
              No homework records found in your repository.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherHomework;
