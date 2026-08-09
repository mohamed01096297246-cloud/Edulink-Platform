import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  PlusCircle,
  Edit3,
  Trash2,
  School,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const GradeManagement = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);

  const [formData, setFormData] = useState({ name: "", academicYear: "" });
  const [editingId, setEditingId] = useState(null);

  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api/grades";
  const config = { headers: { Authorization: `Bearer ${token}` } };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  const fetchGrades = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_URL, config);
      if (res.data.success) {
        setGrades(res.data.data);
      }
    } catch (err) {
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrades();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editingId) {
        const res = await axios.put(
          `${API_URL}/${editingId}`,
          formData,
          config,
        );
        if (res.data.success)
          showToast("Grade updated successfully", "success");
      } else {
        const res = await axios.post(API_URL, formData, config);
        if (res.data.success) showToast("Grade added successfully", "success");
      }
      setFormData({ name: "", academicYear: "" });
      setEditingId(null);
      fetchGrades();
    } catch (err) {
      showToast(err.response?.data?.message || "Operation failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await axios.delete(`${API_URL}/${deleteId}`, config);
      if (res.data.success) {
        showToast("Deleted successfully", "success");
        fetchGrades();
        setDeleteId(null);
      }
    } catch (err) {
      showToast(
        "Cannot delete. This grade might be linked to other data.",
        "error",
      );
      setDeleteId(null);
    }
  };

  const startEdit = (grade) => {
    setEditingId(grade._id);
    setFormData({ name: grade.name, academicYear: grade.academicYear });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : (
              <AlertCircle size={18} className="text-rose-600" />
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-4 border-b pb-6">
          <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-lg">
            <School size={32} />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black text-slate-800">
              Grade Management
            </h1>
            <p className="text-slate-500 font-bold text-xs uppercase italic tracking-wider">
              Academic Levels & Years Setup
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                {editingId ? (
                  <Edit3 size={18} className="text-amber-500" />
                ) : (
                  <PlusCircle size={18} className="text-indigo-500" />
                )}
                {editingId ? "Edit Grade" : "Add New Grade"}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-5 text-left">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 ml-2 uppercase">
                    Grade Name
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Grade 1 / Primary 1"
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 ml-2 uppercase">
                    Academic Year
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. 2025/2026"
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                    value={formData.academicYear}
                    onChange={(e) =>
                      setFormData({ ...formData, academicYear: e.target.value })
                    }
                  />
                </div>

                <button
                  disabled={actionLoading}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg ${
                    editingId
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  {actionLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : editingId ? (
                    "Update Grade"
                  ) : (
                    "Save Grade"
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ name: "", academicYear: "" });
                    }}
                    className="w-full py-2 text-slate-400 font-bold text-xs hover:text-rose-500 transition-colors"
                  >
                    Cancel Editing
                  </button>
                )}
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="p-4 text-xs font-black text-slate-400 uppercase">
                      Grade Name
                    </th>
                    <th className="p-4 text-xs font-black text-slate-400 uppercase">
                      Year
                    </th>
                    <th className="p-4 text-xs font-black text-slate-400 uppercase text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan="3" className="p-10 text-center">
                        <Loader2 className="animate-spin mx-auto text-indigo-500" />
                      </td>
                    </tr>
                  ) : (
                    grades.map((g) => (
                      <tr
                        key={g._id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="p-4 font-black text-slate-700">
                          {g.name}
                        </td>
                        <td className="p-4">
                          <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black tracking-tight">
                            {g.academicYear}
                          </span>
                        </td>
                        <td className="p-4 flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(g)}
                            className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            onClick={() => setDeleteId(g._id)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                  {!loading && grades.length === 0 && (
                    <tr>
                      <td
                        colSpan="3"
                        className="p-10 text-center text-slate-400 font-bold text-sm"
                      >
                        No grades recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                Delete Grade
              </h3>
              <p className="text-sm font-medium text-slate-500">
                Are you sure you want to delete this grade? This action cannot
                be undone if linked to other records.
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

export default GradeManagement;
