import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Building2,
  PlusCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  UserPlus,
  Pencil,
  Trash2,
  Users,
  Power,
  X,
  Copy,
  BookOpen,
  Baby,
} from "lucide-react";

// Platform-super-admin only — onboarding new schools onto EduLink,
// whichever commercial arrangement (owned / subscription) they're under.
const SchoolManager = () => {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [formData, setFormData] = useState({ name: "", code: "", plan: "subscription" });

  const [adminModalSchool, setAdminModalSchool] = useState(null);
  const [adminForm, setAdminForm] = useState({
    firstName: "",
    lastName: "",
    nationalId: "",
    phoneNumber: "",
    email: "",
  });
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const [editSchool, setEditSchool] = useState(null);
  const DEFAULT_FEATURES = { fees: true, examAnalytics: true, staffAttendance: true, behavior: true };
  const FEATURE_LABELS = {
    fees: "الأقساط والمصروفات",
    examAnalytics: "تحليلات النتائج",
    staffAttendance: "حضور المعلمين",
    behavior: "متابعة السلوك",
  };
  const [editForm, setEditForm] = useState({
    name: "",
    plan: "subscription",
    active: true,
    features: DEFAULT_FEATURES,
  });

  const [deleteSchool, setDeleteSchool] = useState(null);

  const [manageAdminsSchool, setManageAdminsSchool] = useState(null);
  const [schoolAdmins, setSchoolAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);

  // Per-person app control (teachers/parents) — reachable from the
  // platform owner's own account, not just a school's own admin. Same
  // underlying data as TeacherManager/ParentManager's "app control"
  // panels, just surfaced here too so the platform owner never has to log
  // into a school's admin account to flip one person's access.
  const APP_FEATURE_SETS = {
    teacher: {
      behavior: "تسجيل السلوك",
      examGrades: "إدخال درجات الامتحانات",
      homeworkGrades: "إدخال درجات الواجبات",
    },
    parent: {
      homework: "الواجبات",
      exams: "الامتحانات",
      grades: "الدرجات",
      behavior: "السلوك",
      notifications: "الإشعارات",
      report: "تقرير الأداء",
    },
  };
  const [manageUsers, setManageUsers] = useState(null); // { school, role }
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ active: true, appFeatures: {} });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchSchools = async () => {
    setLoading(true);
    try {
      const res = await API.get("/schools");
      setSchools(res.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل تحميل المدارس", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, []);

  const handleCreateSchool = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await API.post("/schools", formData);
      showToast("تم إنشاء المدرسة بنجاح", "success");
      setFormData({ name: "", code: "", plan: "subscription" });
      fetchSchools();
    } catch (err) {
      showToast(err.response?.data?.message || "فشل إنشاء المدرسة", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await API.post(
        `/schools/${adminModalSchool._id}/admin`,
        adminForm,
      );
      setCreatedCredentials(res.data.admin);
      showToast("تم إنشاء حساب الإداري", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "فشل إنشاء الإداري", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const closeAdminModal = () => {
    setAdminModalSchool(null);
    setAdminForm({ firstName: "", lastName: "", nationalId: "", phoneNumber: "", email: "" });
    setCreatedCredentials(null);
  };

  const openEditModal = (school) => {
    setEditSchool(school);
    setEditForm({
      name: school.name,
      plan: school.plan,
      active: school.active,
      features: { ...DEFAULT_FEATURES, ...(school.features || {}) },
    });
  };

  const handleUpdateSchool = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await API.put(`/schools/${editSchool._id}`, editForm);
      showToast("تم تحديث بيانات المدرسة بنجاح", "success");
      setEditSchool(null);
      fetchSchools();
    } catch (err) {
      showToast(err.response?.data?.message || "فشل تحديث المدرسة", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSchool = async () => {
    setActionLoading(true);
    try {
      await API.delete(`/schools/${deleteSchool._id}`);
      showToast("تم حذف المدرسة بنجاح", "success");
      setDeleteSchool(null);
      fetchSchools();
    } catch (err) {
      showToast(err.response?.data?.message || "فشل حذف المدرسة", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openManageAdmins = async (school) => {
    setManageAdminsSchool(school);
    setAdminsLoading(true);
    try {
      const res = await API.get(`/admin/users?role=admin&school=${school._id}`);
      setSchoolAdmins(res.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل تحميل إداريي المدرسة", "error");
    } finally {
      setAdminsLoading(false);
    }
  };

  const closeManageAdmins = () => {
    setManageAdminsSchool(null);
    setSchoolAdmins([]);
  };

  const toggleAdminActive = async (admin) => {
    setActionLoading(true);
    try {
      await API.put(`/admin/user/${admin._id}`, { active: !admin.active });
      showToast(admin.active ? "تم تعطيل الحساب" : "تم تفعيل الحساب", "success");
      openManageAdmins(manageAdminsSchool);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل تحديث الحساب", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (!window.confirm(`هل أنت متأكد من حذف حساب "${admin.firstName} ${admin.lastName}"؟`)) {
      return;
    }
    setActionLoading(true);
    try {
      await API.delete(`/admin/user/${admin._id}`);
      showToast("تم حذف حساب الإداري", "success");
      openManageAdmins(manageAdminsSchool);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل حذف الحساب", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openManageUsers = async (school, role) => {
    setManageUsers({ school, role });
    setUsersLoading(true);
    try {
      const res = await API.get(`/admin/users?role=${role}&school=${school._id}`);
      setUsersList(res.data.data || []);
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          (role === "teacher" ? "فشل تحميل المعلمين" : "فشل تحميل أولياء الأمور"),
        "error",
      );
    } finally {
      setUsersLoading(false);
    }
  };

  const closeManageUsers = () => {
    setManageUsers(null);
    setUsersList([]);
    setEditUserTarget(null);
  };

  const openEditUser = (user) => {
    const featureSet = APP_FEATURE_SETS[manageUsers.role];
    const defaults = Object.keys(featureSet).reduce((acc, k) => ({ ...acc, [k]: true }), {});
    setEditUserTarget(user);
    setEditUserForm({
      active: user.active !== false,
      appFeatures: { ...defaults, ...(user.appFeatures || {}) },
    });
  };

  const handleSaveUserAccess = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await API.put(`/admin/user/${editUserTarget._id}`, editUserForm);
      showToast("تم تحديث صلاحيات الحساب بنجاح", "success");
      setEditUserTarget(null);
      openManageUsers(manageUsers.school, manageUsers.role);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل تحديث الحساب", "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      {toast.show && (
        <div
          className={`fixed top-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border text-sm font-bold ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="text-emerald-500" size={20} />
          ) : (
            <AlertCircle className="text-rose-500" size={20} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Building2 className="text-blue-600" size={36} /> المدارس
          </h1>
          <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
            مستوى المنصة · تسجيل وإدارة كل مدرسة على EduLink
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 sticky top-10">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                <PlusCircle className="text-indigo-500" /> إضافة مدرسة
              </h3>
              <form onSubmit={handleCreateSchool} className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    اسم المدرسة
                  </label>
                  <input
                    required
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                    placeholder="مثال: مدرسة جرين فيلد الدولية"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    الكود المختصر
                  </label>
                  <input
                    required
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                    placeholder="مثال: GREENFIELD"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    نوع التعامل
                  </label>
                  <select
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                  >
                    <option value="subscription">اشتراك</option>
                    <option value="owned">تملّك كامل</option>
                  </select>
                </div>
                <button
                  disabled={actionLoading}
                  className="sm:col-span-2 w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={20} /> : "إنشاء المدرسة"}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        المدرسة
                      </th>
                      <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        نوع التعامل
                      </th>
                      <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        الحالة
                      </th>
                      <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                        الإجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="p-16 text-center">
                          <Loader2 className="animate-spin inline text-blue-600" size={36} />
                        </td>
                      </tr>
                    ) : schools.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="p-16 text-center text-slate-400 font-bold">
                          لا يوجد مدارس بعد. أضف أول مدرسة من اليمين.
                        </td>
                      </tr>
                    ) : (
                      schools.map((school) => (
                        <tr key={school._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-6">
                            <p className="font-black text-slate-700">{school.name}</p>
                            <p className="text-[10px] font-bold text-blue-500 uppercase">
                              {school.code}
                            </p>
                          </td>
                          <td className="p-6">
                            <span
                              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                school.plan === "owned"
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {school.plan === "owned" ? "تملّك كامل" : "اشتراك"}
                            </span>
                          </td>
                          <td className="p-6">
                            <span
                              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                school.active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {school.active ? "نشطة" : "موقوفة"}
                            </span>
                          </td>
                          <td className="p-6">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button
                                onClick={() => openEditModal(school)}
                                title="تعديل بيانات المدرسة"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all text-xs font-bold"
                              >
                                <Pencil size={15} /> تعديل
                              </button>
                              <button
                                onClick={() => openManageAdmins(school)}
                                title="إدارة الإداريين"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all text-xs font-bold"
                              >
                                <Users size={15} /> الإداريين
                              </button>
                              <button
                                onClick={() => openManageUsers(school, "teacher")}
                                title="التحكم في تطبيق المعلمين"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all text-xs font-bold"
                              >
                                <BookOpen size={15} /> المعلمين
                              </button>
                              <button
                                onClick={() => openManageUsers(school, "parent")}
                                title="التحكم في تطبيق أولياء الأمور"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all text-xs font-bold"
                              >
                                <Baby size={15} /> أولياء الأمور
                              </button>
                              <button
                                onClick={() => setAdminModalSchool(school)}
                                title="إضافة أول إداري"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all text-xs font-bold"
                              >
                                <UserPlus size={15} /> إضافة إداري
                              </button>
                              <button
                                onClick={() => setDeleteSchool(school)}
                                title="حذف المدرسة"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all text-xs font-bold"
                              >
                                <Trash2 size={15} /> حذف
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

      {adminModalSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-lg font-black">
                أول إداري — {adminModalSchool.name}
              </h2>
              <button onClick={closeAdminModal} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>

            {createdCredentials ? (
              <div className="p-8 space-y-5 text-center">
                <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
                <p className="font-bold text-slate-700">
                  تم إنشاء حساب الإداري. احفظ بيانات الدخول دي دلوقتي — مش
                  هتتعرض تاني.
                </p>
                <div className="bg-slate-50 rounded-2xl p-5 space-y-2 text-right font-mono text-sm" dir="ltr">
                  <p>
                    <span className="text-slate-400">اسم المستخدم:</span>{" "}
                    {createdCredentials.username}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(createdCredentials.username);
                    showToast("تم نسخ اسم المستخدم", "success");
                  }}
                  className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 hover:underline"
                >
                  <Copy size={14} /> نسخ اسم المستخدم
                </button>
                <button
                  onClick={closeAdminModal}
                  className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
                >
                  تم
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateAdmin} className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Input
                  label="الاسم الأول"
                  value={adminForm.firstName}
                  onChange={(e) => setAdminForm({ ...adminForm, firstName: e.target.value })}
                />
                <Input
                  label="الاسم الأخير"
                  value={adminForm.lastName}
                  onChange={(e) => setAdminForm({ ...adminForm, lastName: e.target.value })}
                />
                <Input
                  label="الرقم القومي"
                  maxLength={14}
                  minLength={14}
                  pattern="[0-9]{14}"
                  value={adminForm.nationalId}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, nationalId: e.target.value.replace(/\D/g, "") })
                  }
                />
                <Input
                  label="رقم الهاتف"
                  maxLength={11}
                  minLength={11}
                  pattern="[0-9]{11}"
                  value={adminForm.phoneNumber}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, phoneNumber: e.target.value.replace(/\D/g, "") })
                  }
                />
                <div className="md:col-span-2 lg:col-span-2">
                  <Input
                    label="البريد الإلكتروني (سيتم إرسال بيانات الدخول إليه)"
                    type="email"
                    required={false}
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
                </div>
                <button
                  disabled={actionLoading}
                  className="md:col-span-2 lg:col-span-3 mt-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={20} /> : "إنشاء حساب الإداري"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {editSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-lg font-black">تعديل — {editSchool.name}</h2>
              <button onClick={() => setEditSchool(null)} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>
            <form onSubmit={handleUpdateSchool} className="p-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Input
                  label="اسم المدرسة"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    نوع التعامل
                  </label>
                  <select
                    className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                    value={editForm.plan}
                    onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                  >
                    <option value="subscription">اشتراك</option>
                    <option value="owned">تملّك كامل</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl cursor-pointer">
                <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                  <Power size={16} className={editForm.active ? "text-emerald-500" : "text-rose-500"} />
                  المدرسة نشطة
                </span>
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                  className="w-5 h-5 accent-indigo-600"
                />
              </label>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  المميزات المفعّلة لهذه المدرسة
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.keys(DEFAULT_FEATURES).map((key) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl cursor-pointer"
                    >
                      <span className="font-bold text-slate-700 text-sm">
                        {FEATURE_LABELS[key]}
                      </span>
                      <input
                        type="checkbox"
                        checked={editForm.features[key]}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            features: { ...editForm.features, [key]: e.target.checked },
                          })
                        }
                        className="w-5 h-5 accent-indigo-600"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <button
                disabled={actionLoading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="animate-spin" size={20} /> : "حفظ التعديلات"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 text-center space-y-5">
            <AlertTriangle className="mx-auto text-rose-500" size={40} />
            <div>
              <p className="font-black text-slate-800">حذف "{deleteSchool.name}"؟</p>
              <p className="text-slate-500 text-sm font-medium mt-2">
                لو المدرسة فيها أي طلاب أو حسابات مسجّلة بالفعل، الحذف هيُرفض تلقائيًا — استخدم "تعديل" وأطفئ حالة النشاط بدل الحذف في الحالة دي.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteSchool(null)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
              >
                تراجع
              </button>
              <button
                onClick={handleDeleteSchool}
                disabled={actionLoading}
                className="flex-1 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="animate-spin" size={18} /> : "احذف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {manageAdminsSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-6 bg-blue-600 text-white flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-black">إداريو — {manageAdminsSchool.name}</h2>
              <button onClick={closeManageAdmins} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {adminsLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="animate-spin inline text-blue-600" size={32} />
                </div>
              ) : schoolAdmins.length === 0 ? (
                <p className="text-slate-400 font-bold text-sm py-8 text-center">
                  لا يوجد إداريين مسجّلين لهذه المدرسة بعد.
                </p>
              ) : (
                schoolAdmins.map((admin) => (
                  <div
                    key={admin._id}
                    className="bg-slate-50 rounded-2xl p-5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-black text-slate-800">
                        {admin.firstName} {admin.lastName}
                        {admin.isPrimaryAdmin && (
                          <span className="mr-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-600 uppercase">
                            رئيسي
                          </span>
                        )}
                      </p>
                      <p className="text-slate-500 text-xs font-bold mt-1" dir="ltr">
                        {admin.username} · {admin.phoneNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleAdminActive(admin)}
                        disabled={actionLoading}
                        title={admin.active ? "تعطيل الحساب" : "تفعيل الحساب"}
                        className={`p-2.5 rounded-xl transition-all ${
                          admin.active
                            ? "text-emerald-600 hover:bg-emerald-50"
                            : "text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        <Power size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteAdmin(admin)}
                        disabled={actionLoading}
                        title="حذف الحساب"
                        className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {manageUsers && !editUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-6 bg-blue-600 text-white flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-black">
                {manageUsers.role === "teacher" ? "معلمو" : "أولياء أمور"} — {manageUsers.school.name}
              </h2>
              <button onClick={closeManageUsers} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {usersLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="animate-spin inline text-blue-600" size={32} />
                </div>
              ) : usersList.length === 0 ? (
                <p className="text-slate-400 font-bold text-sm py-8 text-center">
                  {manageUsers.role === "teacher"
                    ? "لا يوجد معلمين مسجّلين لهذه المدرسة بعد."
                    : "لا يوجد أولياء أمور مسجّلين لهذه المدرسة بعد."}
                </p>
              ) : (
                usersList.map((user) => (
                  <div
                    key={user._id}
                    className="bg-slate-50 rounded-2xl p-5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-black text-slate-800">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-slate-500 text-xs font-bold mt-1" dir="ltr">
                        {user.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                          user.active
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {user.active ? "مفتوح" : "مغلق"}
                      </span>
                      <button
                        onClick={() => openEditUser(user)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-xl transition-all text-xs font-bold"
                      >
                        <Pencil size={14} /> التحكم
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {editUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-lg font-black">
                {editUserTarget.firstName} {editUserTarget.lastName}
              </h2>
              <button onClick={() => setEditUserTarget(null)} className="p-2 hover:bg-white/10 rounded-full">
                <X />
              </button>
            </div>
            <form onSubmit={handleSaveUserAccess} className="p-8 space-y-4">
              <div
                className={`flex items-center justify-between gap-3 p-4 rounded-2xl cursor-pointer border-2 ${
                  editUserForm.active ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
                }`}
                onClick={() => setEditUserForm({ ...editUserForm, active: !editUserForm.active })}
              >
                <span className="font-black text-sm text-slate-700 flex items-center gap-2">
                  <Power size={16} className={editUserForm.active ? "text-emerald-500" : "text-rose-500"} />
                  {editUserForm.active ? "التطبيق مفتوح لهذا الحساب" : "التطبيق مغلق لهذا الحساب"}
                </span>
                <input
                  type="checkbox"
                  checked={editUserForm.active}
                  onChange={(e) => setEditUserForm({ ...editUserForm, active: e.target.checked })}
                  className="w-5 h-5 accent-emerald-600"
                />
              </div>

              {editUserForm.active && (
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    الشاشات المتاحة له داخل التطبيق
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.keys(APP_FEATURE_SETS[manageUsers.role]).map((key) => (
                      <label
                        key={key}
                        className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl cursor-pointer"
                      >
                        <span className="font-bold text-slate-700 text-sm">
                          {APP_FEATURE_SETS[manageUsers.role][key]}
                        </span>
                        <input
                          type="checkbox"
                          checked={editUserForm.appFeatures[key]}
                          onChange={(e) =>
                            setEditUserForm({
                              ...editUserForm,
                              appFeatures: { ...editUserForm.appFeatures, [key]: e.target.checked },
                            })
                          }
                          className="w-5 h-5 accent-indigo-600"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                disabled={actionLoading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="animate-spin" size={20} /> : "حفظ التعديلات"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Input = ({ label, type = "text", required = true, ...props }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-black text-slate-400 uppercase mr-2">{label}</label>
    <input
      type={type}
      required={required}
      className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm transition-all"
      {...props}
    />
  </div>
);

export default SchoolManager;
