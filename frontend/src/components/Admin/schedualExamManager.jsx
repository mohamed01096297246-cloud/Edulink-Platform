import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  Clock,
  BookOpen,
  Loader2,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  Tag,
  Filter,
} from "lucide-react";

const ExamManagement = () => {
  const [exams, setExams] = useState([]);
  const [grades, setGrades] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingExamId, setEditingExamId] = useState(null);

  const [selectedFilterGrade, setSelectedFilterGrade] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);

  const [formData, setFormData] = useState({
    title: "",
    examType: "final",
    academicYear: "",
    grade: "",
    timetable: [{ subject: "", date: "", startTime: "", endTime: "" }],
  });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [examsRes, gradesRes, subjectsRes] = await Promise.all([
        API.get("/exams"),
        API.get("/grades"),
        API.get("/subjects"),
      ]);

      setExams(
        examsRes.data.data ||
          (Array.isArray(examsRes.data) ? examsRes.data : []),
      );
      setGrades(
        gradesRes.data.data ||
          (Array.isArray(gradesRes.data) ? gradesRes.data : []),
      );
      setSubjects(
        subjectsRes.data.data ||
          (Array.isArray(subjectsRes.data) ? subjectsRes.data : []),
      );
    } catch (err) {
      showToast("فشل تحميل البيانات الدراسية", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredExams = selectedFilterGrade
    ? exams.filter((exam) => {
        const examGradeId = exam.grade?._id || exam.grade;
        return String(examGradeId) === String(selectedFilterGrade);
      })
    : exams;

  const handleTimetableChange = (index, field, value) => {
    const updatedTimetable = [...formData.timetable];
    updatedTimetable[index][field] = value;
    setFormData({ ...formData, timetable: updatedTimetable });
  };

  const addTimetableRow = () => {
    setFormData({
      ...formData,
      timetable: [
        ...formData.timetable,
        { subject: "", date: "", startTime: "", endTime: "" },
      ],
    });
  };

  const removeTimetableRow = (index) => {
    const updatedTimetable = formData.timetable.filter((_, i) => i !== index);
    setFormData({ ...formData, timetable: updatedTimetable });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hasEmptyFields = formData.timetable.some(
      (row) => !row.subject || !row.date || !row.startTime || !row.endTime,
    );
    if (hasEmptyFields) {
      showToast(
        "من فضلك املأ كل حقول الجدول (المادة، التاريخ، والأوقات)",
        "error",
      );
      return;
    }
    setActionLoading(true);
    try {
      if (editingExamId) {
        await API.put(`/exams/${editingExamId}`, formData);
        showToast("تم تحديث جدول الامتحان بنجاح", "success");
      } else {
        await API.post("/exams", formData);
        showToast("تم نشر جدول الامتحان الجديد", "success");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || "فشلت العملية", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await API.delete(`/exams/${deleteId}`);
      showToast("تم حذف الجدول بنجاح", "success");
      fetchData();
      setDeleteId(null);
    } catch (err) {
      showToast("فشل الحذف", "error");
      setDeleteId(null);
    }
  };

  const openModal = (exam = null) => {
    if (exam) {
      setEditingExamId(exam._id);
      setFormData({
        title: exam.title,
        examType: exam.examType || "final",
        academicYear: exam.academicYear,
        grade: exam.grade?._id || exam.grade,
        timetable: exam.timetable.map((t) => ({
          subject: t.subject?._id || t.subject,
          date: t.date ? t.date.split("T")[0] : "",
          startTime: t.startTime,
          endTime: t.endTime,
        })),
      });
    } else {
      setEditingExamId(null);
      setFormData({
        title: "",
        examType: "final",
        academicYear: "",
        grade: "",
        timetable: [{ subject: "", date: "", startTime: "", endTime: "" }],
      });
    }
    setShowModal(true);
  };

  const renderExamTypeBadge = (type) => {
    switch (type) {
      case "midterm":
        return (
          <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-md flex items-center gap-1">
            <Tag size={10} /> نصف العام
          </span>
        );
      case "final":
        return (
          <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-md flex items-center gap-1">
            <Tag size={10} /> نهاية العام
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-black text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-0.5 rounded-md flex items-center gap-1">
            <Tag size={10} /> رسمي
          </span>
        );
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-right" dir="rtl">
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

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <CalendarDays className="text-indigo-600" size={32} /> جداول الامتحانات
            </h1>
            <p className="text-slate-500 mt-1">
              إدارة ونشر مواعيد الامتحانات الدراسية
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="relative flex items-center min-w-[200px]">
              <Filter
                size={16}
                className="absolute right-4 text-slate-400 pointer-events-none"
              />
              <select
                className="form-input !py-3.5 !pr-11 !text-sm cursor-pointer shadow-sm bg-white"
                value={selectedFilterGrade}
                onChange={(e) => setSelectedFilterGrade(e.target.value)}
              >
                <option value="">كل المراحل (بدون فلتر)</option>
                {grades.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => openModal()}
              className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all whitespace-nowrap"
            >
              <Plus size={20} /> إنشاء جدول جديد
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-20">
              <Loader2
                className="animate-spin inline text-indigo-600"
                size={48}
              />
              <p className="mt-4 text-slate-400 font-bold tracking-widest">
                جارٍ تحميل الجداول...
              </p>
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="col-span-full bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200">
              <AlertCircle className="mx-auto text-slate-200 mb-4" size={64} />
              <p className="text-slate-400 font-black uppercase tracking-widest">
                لا يوجد جداول امتحانات مطابقة لهذا الاختيار
              </p>
            </div>
          ) : (
            filteredExams.map((exam) => (
              <div
                key={exam._id}
                className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-tighter">
                        {exam.grade?.name || "عام"}
                      </span>
                      {renderExamTypeBadge(exam.examType)}
                    </div>
                    <h3 className="text-xl font-black text-slate-800 pt-1">
                      {exam.title}
                    </h3>
                    <p className="text-xs font-bold text-slate-400">
                      {exam.academicYear}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openModal(exam)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => setDeleteId(exam._id)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {exam.timetable.slice(0, 3).map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-indigo-400" />
                        <span className="text-xs font-bold text-slate-700">
                          {t.subject?.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-black text-slate-400">
                        {t.startTime}
                      </span>
                    </div>
                  ))}
                  {exam.timetable.length > 3 && (
                    <p className="text-[10px] text-center font-bold text-slate-300">
                      +{exam.timetable.length - 3} مواد أخرى
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black text-slate-800">
                  {editingExamId ? "تحديث الجدول" : "جدول امتحان جديد"}
                </h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  املأ البيانات الدراسية بالأسفل
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-3 bg-white rounded-2xl shadow-sm hover:bg-rose-50 hover:text-rose-500 transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-8 overflow-y-auto space-y-10"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 uppercase mr-2">
                    عنوان الامتحان
                  </label>
                  <input
                    required
                    type="text"
                    pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                    className="form-input"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="امتحانات نصف العام"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 uppercase mr-2">
                    نوع الامتحان
                  </label>
                  <select
                    required
                    className="form-input"
                    value={formData.examType}
                    onChange={(e) =>
                      setFormData({ ...formData, examType: e.target.value })
                    }
                  >
                    <option value="final">امتحان نهاية العام</option>
                    <option value="midterm">امتحان نصف العام</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 uppercase mr-2">
                    السنة الدراسية
                  </label>
                  <input
                    required
                    type="text"
                    pattern="\d{4}/\d{4}"
                    className="form-input"
                    value={formData.academicYear}
                    onChange={(e) =>
                      setFormData({ ...formData, academicYear: e.target.value })
                    }
                    placeholder="2025/2026"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 uppercase mr-2">
                    المرحلة الدراسية
                  </label>
                  <select
                    required
                    className="form-input"
                    value={formData.grade}
                    onChange={(e) =>
                      setFormData({ ...formData, grade: e.target.value })
                    }
                  >
                    <option value="">اختر المرحلة...</option>
                    {grades.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-slate-800 flex items-center gap-2">
                    <Clock className="text-indigo-600" size={20} /> بيانات الجدول
                  </h3>
                  <button
                    type="button"
                    onClick={addTimetableRow}
                    className="text-indigo-600 text-[10px] font-black bg-indigo-50 px-5 py-2.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all uppercase tracking-widest"
                  >
                    + إضافة مادة
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.timetable.map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 items-end"
                    >
                      <div className="md:col-span-4 space-y-1">
                        <label className="text-[11px] font-black text-slate-400 uppercase mr-1">
                          المادة
                        </label>
                        <select
                          required
                          className="form-input !py-3 !text-sm"
                          value={row.subject}
                          onChange={(e) =>
                            handleTimetableChange(
                              index,
                              "subject",
                              e.target.value,
                            )
                          }
                        >
                          <option value="">اختر المادة...</option>
                          {subjects
                            .filter((s) => {
                              if (!formData.grade) return false;
                              const subjectGradeId = s.grade?._id || s.grade;
                              return (
                                String(subjectGradeId) ===
                                String(formData.grade)
                              );
                            })
                            .map((s) => (
                              <option key={s._id} value={s._id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-[11px] font-black text-slate-400 uppercase mr-1">
                          التاريخ
                        </label>
                        <input
                          type="date"
                          required
                          className="form-input !py-3 !text-sm"
                          value={row.date}
                          onChange={(e) =>
                            handleTimetableChange(index, "date", e.target.value)
                          }
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[11px] font-black text-slate-400 uppercase mr-1">
                          من
                        </label>
                        <input
                          type="time"
                          required
                          className="form-input !py-3 !text-sm"
                          value={row.startTime}
                          onChange={(e) =>
                            handleTimetableChange(
                              index,
                              "startTime",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[11px] font-black text-slate-400 uppercase mr-1">
                          إلى
                        </label>
                        <input
                          type="time"
                          required
                          className="form-input !py-3 !text-sm"
                          value={row.endTime}
                          onChange={(e) =>
                            handleTimetableChange(
                              index,
                              "endTime",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="md:col-span-1 flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => removeTimetableRow(index)}
                          className="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                disabled={actionLoading}
                className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-2xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save size={22} />
                )}
                {editingExamId ? "تحديث الجدول" : "نشر الجدول"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- Delete Confirmation Modal --- */}
      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                حذف الجدول
              </h3>
              <p className="text-sm font-medium text-slate-500">
                هل أنت متأكد من حذف جدول الامتحان ده؟ لا يمكن التراجع عن هذا الإجراء.
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

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .form-input {
          width: 100%;
          padding: 1rem 1.5rem;
          background-color: #ffffff;
          border: 2px solid #f1f5f9;
          border-radius: 1.5rem;
          font-weight: 700;
          color: #334155;
          outline: none;
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: #6366f1;
          background-color: #ffffff;
          box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.1);
        }
        select.form-input {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: left 1.5rem center;
          background-size: 1.25rem;
        }
      `,
        }}
      />
    </div>
  );
};

export default ExamManagement;
