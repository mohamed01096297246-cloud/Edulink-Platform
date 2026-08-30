import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  UserPlus,
  Users,
  Search,
  GraduationCap,
  Baby,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  Edit3,
  Loader2,
  X,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const StudentManagement = () => {
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

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
    phoneNumber: "",
    email: "",
    gender: "male",
    grade: "",
    parentFirstName: "",
    parentLastName: "",
    parentNationalId: "",
    parentEmail: "",
    parentPhone: "",
  });

  const showToastMessage = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, gradesRes] = await Promise.all([
        API.get("/students"),
        API.get("/grades"),
      ]);
      setStudents(studentsRes.data.data || []);
      setGrades(gradesRes.data.data || []);
    } catch (err) {
      console.error("Fetch Error:", err);
      showToastMessage("فشل تحميل بيانات الطلاب", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditMode(false);
    setSelectedStudentId(null);
    setFormData({
      firstName: "",
      lastName: "",
      phoneNumber: "",
      email: "",
      gender: "male",
      grade: "",
      parentFirstName: "",
      parentLastName: "",
      parentNationalId: "",
      parentEmail: "",
      parentPhone: "",
    });
  };

  const handleEdit = (student) => {
    setEditMode(true);
    setSelectedStudentId(student._id);
    setFormData({
      firstName: student.firstName || "",
      lastName: student.lastName || "",
      phoneNumber: student.phoneNumber || "",
      email: student.email || "",
      gender: student.gender || "male",
      grade: student.grade?._id || "",
      parentNationalId: student.parent?.nationalId || "",
      parentFirstName: student.parent?.firstName || "",
      parentLastName: student.parent?.lastName || "",
      parentPhone: student.parent?.phoneNumber || "",
      parentEmail: student.parent?.email || "",
    });
    setShowModal(true);
  };
  const openDeleteModal = (student) => {
    setDeleteModal({
      show: true,
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
    });
  };

  // التعديل هنا: يغلق المودال فوراً سواء نجحت العملية أو فشلت لتظهر رسالة الـ Toast بوضوح
  const confirmDelete = async () => {
    setActionLoading(true);
    try {
      await API.delete(`/students/${deleteModal.id}`);
      setDeleteModal({ show: false, id: null, name: "" }); // إغلاق المودال عند النجاح
      showToastMessage(
        "تم حذف سجل الطالب بنجاح",
        "success",
      );
      fetchData();
    } catch (err) {
      setDeleteModal({ show: false, id: null, name: "" }); // إغلاق المودال فوراً عند الفشل لتظهر رسالة الخطأ
      showToastMessage(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "حدث خطأ أثناء حذف الطالب",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editMode) {
        await API.put(`/students/${selectedStudentId}`, formData);
        showToastMessage("تم تحديث بيانات الطالب بنجاح!", "success");
      } else {
        await API.post("/students", formData);
        showToastMessage("تم تسجيل الطالب الجديد بنجاح!", "success");
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.error || "حدث خطأ أثناء حفظ بيانات الطالب",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      `${s.firstName} ${s.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) &&
      (filterGrade === "" || s.grade?._id === filterGrade),
  );

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen relative" dir="rtl">
      {toast.show && (
        <div
          className={`fixed bottom-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border animate-slide-in text-sm font-bold ${
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
            className="mr-2 p-1 hover:bg-black/5 rounded-lg transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-100">
              <GraduationCap size={30} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                دليل الطلاب
              </h1>
              <p className="text-slate-400 font-medium text-sm italic">
                إدارة التسجيل وربط أولياء الأمور
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
            <UserPlus size={20} /> تسجيل طالب جديد
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
              إجمالي الطلاب
            </p>
            <h3 className="text-2xl font-black text-slate-800">
              {students.length}
            </h3>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-grow">
            <Search
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              placeholder="ابحث باسم الطالب..."
              className="w-full pr-14 pl-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none focus:border-blue-500 shadow-sm font-medium"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-white border border-slate-200 px-6 py-4 rounded-[1.5rem] font-bold text-slate-600 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
            onChange={(e) => setFilterGrade(e.target.value)}
            value={filterGrade}
          >
            <option value="">كل المراحل</option>
            {grades.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    بيانات الطالب
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    المرحلة والفصل
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    ولي الأمر
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-20 text-center">
                      <Loader2
                        className="animate-spin inline text-blue-600"
                        size={40}
                      />
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-16 text-center">
                      <p className="text-slate-400 font-bold">
                        {students.length === 0
                          ? "لا يوجد طلاب مسجّلين بعد. اضغط \"تسجيل طالب جديد\" لإضافة أول طالب."
                          : "لا يوجد طلاب مطابقين للبحث أو الفلتر."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr
                      key={student._id}
                      className="hover:bg-blue-50/30 transition-colors group"
                    >
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm ${student.gender === "male" ? "bg-indigo-100 text-indigo-600" : "bg-rose-100 text-rose-600"}`}
                          >
                            {student.firstName ? student.firstName[0] : ""}
                            {student.lastName ? student.lastName[0] : ""}
                          </div>
                          <div>
                            <p className="font-black text-slate-700">
                              {student.firstName} {student.lastName}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              {student.gender === "male" ? "ذكر" : "أنثى"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black block w-fit mb-1">
                          {student.grade?.name || "غير محدد"}
                        </span>
                        <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[10px] font-black block w-fit border border-blue-100">
                          {student.classroom?.name || "جارٍ التخصيص..."}
                        </span>
                      </td>
                      <td className="p-6">
                        <span className="text-sm font-bold text-slate-600">
                          {student.parent?.firstName} {student.parent?.lastName}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleEdit(student)}
                            className="p-3 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Edit3 size={20} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(student)}
                            className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 size={20} />
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

      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-fade-in text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">
                حذف الطالب
              </h3>
              <p className="text-slate-400 font-medium text-sm mt-2">
                هل أنت متأكد إنك عايز تحذف{" "}
                <strong className="text-slate-700 font-bold">
                  {deleteModal.name}
                </strong>{" "}
                نهائيًا من السجلات؟ لا يمكن التراجع عن هذا الإجراء.
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
                إلغاء
              </button>
              <button
                disabled={actionLoading}
                onClick={confirmDelete}
                className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-100 flex justify-center items-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  "نعم، احذف"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editMode ? "تعديل بيانات الطالب" : "تسجيل طالب جديد"}
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                  {editMode
                    ? "تحديث بيانات الطالب الحالية"
                    : "التخصيص التلقائي للفصل مفعّل"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-3 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-2xl transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-8 overflow-y-auto space-y-10"
            >
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-indigo-600">
                  <Baby size={20} />
                  <h3 className="font-black text-sm uppercase tracking-widest">
                    البيانات الشخصية
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="label-style">
                      الاسم الأول
                    </label>
                    <input
                      required
                      type="text"
                      pattern="^[A-Za-z؀-ۿ\s]+$"
                      value={formData.firstName}
                      className="modal-input"
                      placeholder="الاسم الأول للطالب"
                      onChange={(e) =>
                        setFormData({ ...formData, firstName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label-style">
                      الاسم الأخير
                    </label>
                    <input
                      required
                      type="text"
                      pattern="^[A-Za-z؀-ۿ\s]+$"
                      value={formData.lastName}
                      className="modal-input"
                      placeholder="الاسم الأخير للطالب"
                      onChange={(e) =>
                        setFormData({ ...formData, lastName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label-style">
                      النوع
                    </label>
                    <select
                      required
                      value={formData.gender}
                      className="modal-input"
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value })
                      }
                    >
                      <option value="male">ذكر</option>
                      <option value="female">أنثى</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="label-style">
                      المرحلة الدراسية
                    </label>
                    <select
                      required
                      value={formData.grade}
                      className="modal-input"
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
                  <div className="space-y-2">
                    <label className="label-style">
                      هاتف الطالب
                    </label>
                    <input
                      required
                      type="text"
                      pattern="[0-9]{11}"
                      maxLength={11}
                      minLength={11}
                      value={formData.phoneNumber}
                      className="modal-input"
                      placeholder="رقم هاتف الطالب"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          phoneNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-3 text-indigo-600">
                  <ShieldCheck size={20} />
                  <h3 className="font-black text-sm uppercase tracking-widest">
                    بيانات ولي الأمر
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="label-style">
                      اسم ولي الأمر الأول
                    </label>
                    <input
                      type="text"
                      pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                      required
                      value={formData.parentFirstName}
                      className="modal-input"
                      placeholder="الاسم الأول"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentFirstName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label-style">
                      اسم ولي الأمر الأخير
                    </label>
                    <input
                      type="text"
                      pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                      required
                      value={formData.parentLastName}
                      className="modal-input"
                      placeholder="الاسم الأخير"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentLastName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label-style">
                      هاتف ولي الأمر
                    </label>
                    <input
                      type="text"
                      pattern="[0-9]{11}"
                      maxLength={11}
                      minLength={11}
                      required
                      value={formData.parentPhone}
                      className="modal-input"
                      placeholder="رقم هاتف ولي الأمر"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentPhone: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label-style !text-rose-500 italic underline">
                      الرقم القومي (مطلوب)
                    </label>
                    <input
                      type="text"
                      pattern="[0-9]{14}"
                      maxLength={14}
                      minLength={14}
                      required
                      value={formData.parentNationalId}
                      className="modal-input border-rose-100 focus:border-rose-400"
                      placeholder="الرقم القومي"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentNationalId: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="label-style">
                      إيميل ولي الأمر
                    </label>
                    <input
                      type="email"
                      value={formData.parentEmail}
                      className="modal-input"
                      placeholder="البريد الإلكتروني لولي الأمر"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentEmail: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <button
                disabled={actionLoading}
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 flex justify-center items-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <>
                    {editMode ? "تحديث بيانات الطالب" : "تسجيل الطالب"}{" "}
                    <ChevronLeft size={18} />
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
        .modal-input {
          width: 100%; padding: 1.1rem; background: #F8FAFC; border: 2px solid #F1F5F9; border-radius: 1.2rem; font-weight: 700; font-size: 0.9rem; outline: none; transition: 0.2s;
        }
        .modal-input:focus { border-color: #6366f1; background: white; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .label-style { font-size: 13px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-right: 8px; }
        
        @keyframes slideIn {
          from { transform: translateY(1rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-slide-in { animation: slideIn 0.3s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
      `,
        }}
      />
    </div>
  );
};

export default StudentManagement;
