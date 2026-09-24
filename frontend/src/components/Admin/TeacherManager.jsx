import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import { toLatinDigits } from "../../utils/phone";
import {
  UserPlus,
  Users,
  Loader2,
  X,
  Search,
  Layers,
  BookOpen,
  Trash2,
  Edit3,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ClipboardList,
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

  // The school's own inbox for login credentials (School.parentInbox) —
  // the same default the student registration form uses, since most
  // teachers' accounts are handed over by the school itself. Editable per
  // teacher for anyone who wants theirs sent to their own Gmail.
  const [schoolInbox, setSchoolInbox] = useState("");

  // The school's staff list (StaffCandidate): search a name, pick it, and
  // the form fills itself. `staffPending` is how many are still waiting —
  // 0 for a school with no list, which hides the box entirely.
  const [staffPending, setStaffPending] = useState(0);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffMatches, setStaffMatches] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    nationalId: "",
    subjectIds: [],
    teachingGrades: [],
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
      const [teachersRes, subjectsRes, gradesRes] = await Promise.all([
        API.get("/teacher"),
        API.get("/subjects"),
        API.get("/grades"),
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
      showToastMessage("فشل تحميل البيانات من السيرفر", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    API.get("/auth/me")
      .then((res) => setSchoolInbox(res.data?.user?.parentInbox || ""))
      .catch(() => {});
  }, []);

  // Whether there is a staff list with anyone left on it — asked each time
  // the form opens, since it shrinks with every teacher registered.
  useEffect(() => {
    if (!showModal || editMode) return;
    API.get("/staff-candidates/search")
      .then((res) => setStaffPending(res.data?.pending || 0))
      .catch(() => setStaffPending(0));
  }, [showModal, editMode]);

  useEffect(() => {
    if (editMode || !staffPending) return;
    const query = staffQuery.trim();
    if (query.length < 2) {
      setStaffMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      setStaffLoading(true);
      try {
        const res = await API.get("/staff-candidates/search", {
          params: { q: query },
        });
        setStaffMatches(res.data?.data || []);
      } catch {
        setStaffMatches([]);
      } finally {
        setStaffLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [staffQuery, staffPending, editMode]);

  // Fills everything the list knows. The national ID and a personal email
  // usually aren't on it, so those are left for the admin — the email
  // starting from the school's inbox.
  const pickStaff = (candidate) => {
    setFormData((prev) => ({
      ...prev,
      firstName: candidate.firstName || prev.firstName,
      lastName: candidate.lastName || prev.lastName,
      phoneNumber: candidate.primaryPhone || prev.phoneNumber,
      nationalId: candidate.nationalId || prev.nationalId,
      email: candidate.email || prev.email || schoolInbox,
      subjectIds: candidate.subjects?.length
        ? candidate.subjects.map((subject) => subject._id)
        : prev.subjectIds,
    }));
    setSelectedStaff(candidate);
    setStaffQuery("");
    setStaffMatches([]);
  };

  const resetForm = () => {
    setEditMode(false);
    setSelectedTeacherId(null);
    setFormData({
      firstName: "",
      lastName: "",
      email: schoolInbox,
      phoneNumber: "",
      nationalId: "",
      subjectIds: [],
      teachingGrades: [],
    });
    setStaffQuery("");
    setStaffMatches([]);
    setSelectedStaff(null);
  };

  const handleEditOpen = (teacher) => {
    setEditMode(true);
    setSelectedTeacherId(teacher._id);

    // المواد بترجع populated من السيرفر، فبناخد الـ IDs بس
    const extractedSubjectIds = (teacher.subjects || []).map((s) =>
      s && typeof s === "object" ? s._id : s,
    );

    setFormData({
      firstName: teacher.firstName || "",
      lastName: teacher.lastName || "",
      // ستعمل الحقول أدناه الآن بنجاح بعد تعديل الـ select في الباك-إند
      email: teacher.email || "",
      phoneNumber: teacher.phoneNumber || "",
      nationalId: teacher.nationalId || "",
      subjectIds: extractedSubjectIds,
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
      await API.delete(`/teacher/${deleteModal.id}`);
      showToastMessage("تم حذف سجل المعلم بنجاح", "success");
      fetchData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.message || "حدث خطأ أثناء حذف المعلم",
        "error",
      );
    } finally {
      setDeleteModal({ show: false, id: null, name: "" });
      setActionLoading(false);
    }
  };

  const handleSubjectToggle = (subjectId) => {
    setFormData((prev) => ({
      ...prev,
      subjectIds: prev.subjectIds.includes(subjectId)
        ? prev.subjectIds.filter((id) => id !== subjectId)
        : [...prev.subjectIds, subjectId],
    }));
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

    if (formData.subjectIds.length === 0) {
      showToastMessage("اختر مادة واحدة على الأقل للمعلم", "error");
      return;
    }

    // Login credentials are mailed to this address and nowhere else — a
    // non-Gmail or mistyped domain loses the teacher's password silently.
    if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@gmail\.com$/i.test(
      formData.email.trim(),
    )) {
      showToastMessage(
        "البريد الإلكتروني لازم يكون حساب Gmail صحيح (ينتهي بـ @gmail.com)",
        "error",
      );
      return;
    }

    setActionLoading(true);
    try {
      if (editMode) {
        await API.put(`/teacher/${selectedTeacherId}`, formData);
        showToastMessage("تم تحديث بيانات المعلم بنجاح", "success");
      } else {
        await API.post("/teacher", {
          ...formData,
          staffCandidate: selectedStaff?._id,
        });
        showToastMessage("تم تسجيل المعلم الجديد بنجاح", "success");
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      // createTeacher returns a duplicate-key message (phone/national ID
      // already in use) under `error`, validation errors under `message` —
      // read both so the admin sees the real reason, not a generic string.
      showToastMessage(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "حدث خطأ أثناء حفظ البيانات",
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
    <div className="p-8 bg-[#F8FAFC] min-h-screen relative" dir="rtl">
      {toast.show && (
        <div
          className={`fixed top-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border animate-slide-down text-sm font-bold ${
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
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <Users size={30} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                سجل المعلمين
              </h1>
              <p className="text-slate-400 font-medium text-sm">
                إدارة معلمي المدرسة وتخصيصاتهم
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
            <UserPlus size={20} /> إضافة معلم جديد
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="bg-blue-50 p-4 rounded-2xl text-blue-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
                إجمالي المعلمين
              </p>
              <h3 className="text-2xl font-black text-slate-800">
                {teachers.length}
              </h3>
            </div>
          </div>
        </div>

        <div className="relative mb-8">
          <Search
            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="ابحث باسم المعلم..."
            className="w-full pr-14 pl-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none focus:border-indigo-500 shadow-sm font-medium"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    الاسم الكامل
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    المادة
                  </th>
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    المراحل
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
                        className="animate-spin inline text-indigo-600"
                        size={40}
                      />
                    </td>
                  </tr>
                ) : filteredTeachers.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-16 text-center">
                      <p className="text-slate-400 font-bold">
                        {teachers.length === 0
                          ? "لا يوجد معلمين مسجّلين بعد. اضغط \"إضافة معلم جديد\" لإضافة أول معلم."
                          : "لا يوجد معلمين مطابقين للبحث."}
                      </p>
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
                          {(teacher.subjects || [])
                            .map((s) => s?.name)
                            .filter(Boolean)
                            .join("، ") || "غير محدد"}
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

                          <button
                            onClick={() => openDeleteModal(teacher)}
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

      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-fade-in text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">
                حذف المعلم
              </h3>
              <p className="text-slate-400 font-medium text-sm mt-2">
                هل أنت متأكد إنك عايز تحذف{" "}
                <strong className="text-slate-700 font-bold">
                  {deleteModal.name}
                </strong>{" "}
                نهائيًا؟ هيتم حذف كل جداوله الدراسية كمان.
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
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/30">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editMode ? "تعديل بيانات المعلم" : "إضافة معلم جديد"}
                </h2>
                <p className="text-slate-400 text-xs font-bold uppercase mt-1 tracking-widest">
                  {editMode
                    ? "تعديل بيانات وصلاحيات المعلم"
                    : "تسجيل بيانات معلم جديد"}
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
              {/* The school's staff list: search a teacher, pick them, and
                  the form fills itself — the same flow as registering new
                  students from the admissions list. */}
              {!editMode && (staffPending > 0 || selectedStaff) && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-3xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2 text-emerald-700">
                    <div className="flex items-center gap-2">
                      <ClipboardList size={18} />
                      <span className="text-sm font-black">قائمة المعلمين</span>
                    </div>
                    <span className="text-[11px] font-black bg-white border border-emerald-100 rounded-lg px-2 py-1">
                      باقي {staffPending} معلم لم يُسجَّلوا
                    </span>
                  </div>

                  {selectedStaff ? (
                    <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                          <p className="font-black text-slate-800">
                            {selectedStaff.fullName}
                          </p>
                          <p className="text-[11px] font-bold text-slate-400 mt-1">
                            المادة في الملف: {selectedStaff.subjectLabel || "—"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedStaff(null)}
                          className="text-[11px] font-black text-slate-400 hover:text-rose-500 shrink-0"
                        >
                          إلغاء الاختيار
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedStaff.phones.map((p) => (
                          <button
                            key={p.number}
                            type="button"
                            disabled={p.taken}
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, phoneNumber: p.number }))
                            }
                            title={p.taken ? "الرقم ده عليه حساب معلم بالفعل" : undefined}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              formData.phoneNumber === p.number
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400"
                            }`}
                          >
                            {p.number}
                          </button>
                        ))}
                        {selectedStaff.invalidPhones?.map((raw) => (
                          <span
                            key={raw}
                            title="رقم غير صحيح في الملف — ناقص أو زايد رقم"
                            className="px-3 py-1.5 rounded-xl text-xs font-black border border-amber-200 bg-amber-50 text-amber-700 line-through"
                          >
                            {raw}
                          </span>
                        ))}
                      </div>

                      {!selectedStaff.primaryPhone && (
                        <p className="text-[11px] font-bold text-amber-600">
                          مفيش رقم موبايل صحيح في الملف — اكتبه يدويًا.
                        </p>
                      )}
                      {selectedStaff.subjectLabel &&
                        !selectedStaff.subjects?.length && (
                          <p className="text-[11px] font-bold text-amber-600">
                            مفيش مادة في المدرسة اسمها «{selectedStaff.subjectLabel}» —
                            اختار المادة من القائمة تحت
                            {subjects.length === 0 ? " (بعد ما تضيف المواد من صفحة المواد)" : ""}.
                          </p>
                        )}
                      {!selectedStaff.nationalId && (
                        <p className="text-[11px] font-bold text-slate-500">
                          الرقم القومي مش في الملف — اكتبه تحت.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400"
                          size={18}
                        />
                        <input
                          type="text"
                          value={staffQuery}
                          onChange={(e) => setStaffQuery(e.target.value)}
                          placeholder="ابحث باسم المعلم في القائمة..."
                          className="modal-input !pr-12"
                        />
                        {staffLoading && (
                          <Loader2
                            className="absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-500"
                            size={18}
                          />
                        )}
                      </div>

                      {staffMatches.map((c) => (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => pickStaff(c)}
                          className="w-full text-right bg-white rounded-2xl border border-emerald-100 hover:border-emerald-400 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
                        >
                          <div>
                            <p className="font-black text-slate-700 text-sm">{c.fullName}</p>
                            <p className="text-[11px] font-bold text-slate-400">
                              {c.subjectLabel || "—"}
                            </p>
                          </div>
                          <span className="text-xs font-black text-emerald-700 shrink-0">
                            {c.primaryPhone || "بدون رقم صحيح"}
                          </span>
                        </button>
                      ))}

                      {!staffLoading &&
                        staffQuery.trim().length >= 2 &&
                        staffMatches.length === 0 && (
                          <p className="text-[11px] font-bold text-slate-400 mr-2">
                            مفيش معلم بالاسم ده في القائمة (أو اتسجّل قبل كده).
                          </p>
                        )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="label-style">الاسم الأول</label>
                  <input
                    required
                    type="text"
                    pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                    placeholder="أدخل الاسم الأول"
                    value={formData.firstName}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">الاسم الأخير</label>
                  <input
                    type="text"
                    pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                    placeholder="أدخل الاسم الأخير"
                    required
                    value={formData.lastName}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">الرقم القومي</label>
                  <input
                    type="text"
                    placeholder="رقم قومي مكوّن من 14 رقم"
                    pattern="[0-9]{14}"
                    maxLength={14}
                    minLength={14}
                    required
                    value={formData.nationalId}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nationalId: toLatinDigits(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="label-style">
                    البريد الإلكتروني (Gmail)
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="example@gmail.com"
                    pattern="[a-zA-Z0-9]([a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?@gmail\.com"
                    title="لازم يكون حساب Gmail صحيح ينتهي بـ @gmail.com"
                    value={formData.email}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                  <p className="text-[11px] font-bold text-slate-400 mr-2">
                    كلمة السر واسم المستخدم بيتبعتوا على الإيميل ده — لازم يكون
                    صحيح.
                    {!editMode && schoolInbox && formData.email === schoolInbox
                      ? " متحدد افتراضيًا على إيميل المدرسة، وتقدر تغيّره لإيميل المعلم نفسه."
                      : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="label-style">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="رقم هاتف مكوّن من 11 رقم"
                    pattern="[0-9]{11}"
                    maxLength={11}
                    minLength={11}
                    required
                    value={formData.phoneNumber}
                    className="modal-input"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        phoneNumber: toLatinDigits(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="label-style flex items-center gap-2 border-b border-slate-100 pb-2">
                  <BookOpen size={14} /> المواد التي يُدرّسها
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {subjects.map((subject) => (
                    <div
                      key={subject._id}
                      onClick={() => handleSubjectToggle(subject._id)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all text-center text-[10px] font-black ${
                        formData.subjectIds.includes(subject._id)
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-100 bg-slate-50 text-slate-400"
                      }`}
                    >
                      {subject.name}
                    </div>
                  ))}
                </div>
                {subjects.length === 0 && (
                  <p className="text-xs font-bold text-slate-400">
                    لا توجد مواد مسجّلة بعد — أضف المواد أولًا.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <label className="label-style flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Layers size={14} /> المراحل الدراسية المُسندة إليه
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
                    {editMode ? "تحديث بيانات المعلم" : "إتمام التسجيل"}{" "}
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
        .modal-input { width: 100%; padding: 1.1rem; background: #F8FAFC; border: 2px solid #F1F5F9; border-radius: 1.2rem; font-weight: 700; font-size: 0.9rem; outline: none; transition: 0.2s; }
        .modal-input:focus { border-color: #6366f1; background: white; }
        .label-style { font-size: 13px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-right: 8px; }
        
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
