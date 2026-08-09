import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  UserPlus,
  Users,
  Loader2,
  X,
  Search,
  Layers,
  Trash2,
  Edit3,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const TeacherManagement = () => {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [deleteModal, setDeleteModal] = useState({
    show: false,
    id: null,
    name: "",
  });

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    nationalId: "",
    subjectId: "",
    teachingGrades: [],
  });

  const token = localStorage.getItem("token");
  // استخراج رتبة المستخدم الحالي (تأكد من تخزينك لها أثناء عملية تسجيل الدخول باسم userRole)
  const userRole = localStorage.getItem("userRole");

  const config = { headers: { Authorization: `Bearer ${token}` } };
  const BASE_URL = "http://localhost:5000/api";

  const showToastMessage = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersRes, subjectsRes, gradesRes] = await Promise.all([
        axios.get(`${BASE_URL}/teacher`, config),
        axios.get(`${BASE_URL}/subjects`, config),
        axios.get(`${BASE_URL}/grades`, config),
      ]);

      setTeachers(teachersRes.data.data || []);
      setSubjects(
        Array.isArray(subjectsRes.data)
          ? subjectsRes.data
          : subjectsRes.data.data || [],
      );
      setGrades(gradesRes.data.data || []);
    } catch (err) {
      console.error("Fetch Error:", err);
      showToastMessage("Failed to fetch data from server", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditMode(false);
    setSelectedTeacherId(null);
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      nationalId: "",
      subjectId: "",
      teachingGrades: [],
    });
  };

  const handleEditOpen = (teacher) => {
    setEditMode(true);
    setSelectedTeacherId(teacher._id);

    // استخراج الـ ID الخاص بالمادة بشكل آمن لأنها تأتي كـ Object من الـ populate
    const extractedSubjectId =
      teacher.subject && typeof teacher.subject === "object"
        ? teacher.subject._id
        : teacher.subject || "";

    setFormData({
      firstName: teacher.firstName || "",
      lastName: teacher.lastName || "",
      // ستعمل الحقول أدناه الآن بنجاح بعد تعديل الـ select في الباك-إند
      email: teacher.email || "",
      phoneNumber: teacher.phoneNumber || "",
      nationalId: teacher.nationalId || "",
      subjectId: extractedSubjectId,
      teachingGrades:
        teacher.teachingGrades?.map((g) =>
          g && typeof g === "object" ? g._id : g,
        ) || [],
    });

    setShowModal(true);
  };
  const openDeleteModal = (teacher) => {
    setDeleteModal({
      show: true,
      id: teacher._id,
      name: `${teacher.firstName} ${teacher.lastName}`,
    });
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    try {
      await axios.delete(`${BASE_URL}/teacher/${deleteModal.id}`, config);
      showToastMessage("Instructor record deleted successfully", "success");
      fetchData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.message || "Error deleting instructor",
        "error",
      );
    } finally {
      setDeleteModal({ show: false, id: null, name: "" });
      setActionLoading(false);
    }
  };

  const handleGradeToggle = (gradeId) => {
    setFormData((prev) => ({
      ...prev,
      teachingGrades: prev.teachingGrades.includes(gradeId)
        ? prev.teachingGrades.filter((id) => id !== gradeId)
        : [...prev.teachingGrades, gradeId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editMode) {
        await axios.put(
          `${BASE_URL}/teacher/${selectedTeacherId}`,
          formData,
          config,
        );
        showToastMessage("Instructor profile updated successfully", "success");
      } else {
        await axios.post(`${BASE_URL}/teacher`, formData, config);
        showToastMessage("New instructor registered successfully", "success");
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.message || "An error occurred while saving data",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTeachers = teachers.filter((t) =>
    `${t.firstName} ${t.lastName}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen relative" dir="ltr">
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border animate-slide-down text-sm font-bold ${
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
          <button
            onClick={() =>
              setToast({ show: false, message: "", type: "success" })
            }
            className="ml-2 p-1 hover:bg-black/5 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <Users size={30} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                Faculty Registry
              </h1>
              <p className="text-slate-400 font-medium text-sm">
                Manage school teachers and assignments
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200"
          >
            <UserPlus size={20} /> Add New Teacher
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="bg-blue-50 p-4 rounded-2xl text-blue-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
                Total Teachers
              </p>
              <h3 className="text-2xl font-black text-slate-800">
                {teachers.length}
              </h3>
            </div>
          </div>
        </div>

        <div className="relative mb-8">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search by instructor name..."
            className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none focus:border-indigo-500 shadow-sm font-medium"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Full Name
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Subject
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    Grades
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-20 text-center">
                      <Loader2
                        className="animate-spin inline text-indigo-600"
                        size={40}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredTeachers.map((teacher) => (
                    <tr
                      key={teacher._id}
                      className="hover:bg-indigo-50/30 transition-colors group"
                    >
                      <td className="p-6 font-bold text-slate-700">
                        {teacher.firstName} {teacher.lastName}
                      </td>
                      <td className="p-6">
                        <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-[10px] font-black border border-emerald-100">
                          {teacher.subject?.name || "N/A"}
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-wrap gap-1">
                          {teacher.teachingGrades?.map((g) => (
                            <span
                              key={g._id}
                              className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold"
                            >
                              {g.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleEditOpen(teacher)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          >
                            <Edit3 size={18} />
                          </button>

                          {/* فحص الرتبة: زر الحذف يظهر فقط إذا لم يكن المستخدم sub-admin */}
                          {userRole !== "sub-admin" && (
                            <button
                              onClick={() => openDeleteModal(teacher)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
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

      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-fade-in text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">
                Delete Instructor
              </h3>
              <p className="text-slate-400 font-medium text-sm mt-2">
                Are you sure you want to completely remove{" "}
                <strong className="text-slate-700 font-bold">
                  {deleteModal.name}
                </strong>
                ? This will clear all their teaching schedules.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                disabled={actionLoading}
                onClick={() =>
                  setDeleteModal({ show: false, id: null, name: "" })
                }
                className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={confirmDelete}
                className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-100 flex justify-center items-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  "Yes, Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editMode ? "Update Teacher" : "Add New Teacher"}
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase mt-1 tracking-widest">
                  {editMode
                    ? "Modify teacher profile and permissions"
                    : "New teacher profile registration"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-3 hover:bg-rose-50 text-slate-400 rounded-2xl"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-8 overflow-y-auto space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="label-style">First Name</label>
                  <input
                    required
                    type="text"
                    pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                    placeholder="Enter first name"
                    value={formData.firstName}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">Last Name</label>
                  <input
                    type="text"
                    pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                    placeholder="Enter last name"
                    required
                    value={formData.lastName}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">National ID</label>
                  <input
                    type="text"
                    placeholder="14-digit ID"
                    pattern="[0-9]{14}"
                    maxLength={14}
                    minLength={14}
                    required
                    value={formData.nationalId}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, nationalId: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">Email</label>
                  <input
                    required
                    type="email"
                    placeholder="Enter email address"
                    pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                    value={formData.email}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">Phone</label>
                  <input
                    type="text"
                    placeholder="11-digit phone number"
                    pattern="[0-9]{11}"
                    maxLength={11}
                    minLength={11}
                    required
                    value={formData.phoneNumber}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, phoneNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">Subject</label>
                  <select
                    required
                    value={formData.subjectId}
                    className="modal-input bg-white"
                    onChange={(e) =>
                      setFormData({ ...formData, subjectId: e.target.value })
                    }
                  >
                    <option value="">Select Subject</option>
                    {subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="label-style flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Layers size={14} /> Assigned Teaching Grades
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {grades.map((grade) => (
                    <div
                      key={grade._id}
                      onClick={() => handleGradeToggle(grade._id)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all text-center text-[10px] font-black ${
                        formData.teachingGrades.includes(grade._id)
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-100 bg-slate-50 text-slate-400"
                      }`}
                    >
                      {grade.name}
                    </div>
                  ))}
                </div>
              </div>

              <button
                disabled={actionLoading}
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black hover:bg-indigo-600 transition-all flex justify-center items-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <>
                    {editMode ? "UPDATE TEACHER INFO" : "COMPLETE REGISTRATION"}{" "}
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .modal-input { width: 100%; padding: 1.1rem; background: #F8FAFC; border: 2px solid #F1F5F9; border-radius: 1.2rem; font-weight: 700; font-size: 0.9rem; outline: none; transition: 0.2s; }
        .modal-input:focus { border-color: #6366f1; background: white; }
        .label-style { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 8px; }
        
        @keyframes slideDown {
          from { transform: translateY(-1rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-slide-down { animation: slideDown 0.3s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
      `,
        }}
      />
    </div>
  );
};

export default TeacherManagement;
