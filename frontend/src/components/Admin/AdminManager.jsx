import React, { useState, useEffect } from "react";
import API from "../../api/axios";

import {
  Users,
  ShieldCheck,
  Search,
  Plus,
  Trash2,
  Edit,
  Loader2,
  X,
  UserCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
} from "lucide-react";

const roleLabel = (role) =>
  ({ admin: "الإداري", teacher: "المعلم", parent: "ولي الأمر" })[role] || role;

const AdminPage = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalAdmins: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeRole, setActiveRole] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [deleteModal, setDeleteModal] = useState({
    show: false,
    id: null,
    name: "",
    role: "",
  });
  const [actionLoading, setActionLoading] = useState(false);

  const [userForm, setUserForm] = useState({
    firstName: "",
    lastName: "",
    nationalId: "",
    phoneNumber: "",
    email: "",
    role: "admin",
  });

  const [editModal, setEditModal] = useState({ show: false, user: null });
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
  });

  const currentUserInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
  // A school's own primary admin (its "admin_master" equivalent) and the
  // platform super-admin can both manage other admin accounts — an
  // ordinary sub-admin can't.
  const isMaster = currentUserInfo.isPrimaryAdmin || currentUserInfo.isSuperAdmin;

  const showToastMessage = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  useEffect(() => {
    fetchInitialData();
  }, [activeRole]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const statsRes = await API.get("/admin/dashboard");
      const allUsersRes = await API.get("/admin/users");

      setStats({
        totalStudents: statsRes.data.stats.totalStudents,
        totalTeachers: statsRes.data.stats.totalTeachers,
        totalAdmins: allUsersRes.data.data.filter((u) => u.role === "admin")
          .length,
      });

      const roleQuery = activeRole !== "all" ? `?role=${activeRole}` : "";
      const usersRes = await API.get(`/admin/users${roleQuery}`);
      setUsers(usersRes.data.data);
    } catch (err) {
      console.error("Fetch Error:", err);
      showToastMessage("فشل تحميل إحصائيات اللوحة", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!isMaster) {
      showToastMessage("فقط المدير الأساسي يقدر يضيف إداريين فرعيين", "error");
      return;
    }
    setActionLoading(true);

    try {
      const cleanedData = {
        firstName: userForm.firstName.trim(),
        lastName: userForm.lastName.trim(),
        nationalId: userForm.nationalId.trim(),
        phoneNumber: userForm.phoneNumber.trim(),
        email: userForm.email.trim(),
        role: "admin",
      };

      const response = await API.post("/admin/sub-admin", cleanedData);
      showToastMessage(
        response.data.message || "تم إنشاء حساب الإداري الفرعي بنجاح",
        "success",
      );
      setShowAddModal(false);
      setUserForm({
        firstName: "",
        lastName: "",
        nationalId: "",
        phoneNumber: "",
        email: "",
        role: "admin",
      });
      fetchInitialData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "حدث خطأ ما",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (user) => {
    setEditForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phoneNumber: user.phoneNumber || "",
      email: user.email || "",
    });
    setEditModal({ show: true, user });
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const cleanedData = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phoneNumber: editForm.phoneNumber.trim(),
        email: editForm.email.trim(),
      };
      await API.put(`/admin/user/${editModal.user._id}`, cleanedData);
      showToastMessage("تم تحديث بيانات الحساب بنجاح", "success");
      setEditModal({ show: false, user: null });
      fetchInitialData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.message || err.response?.data?.error || "حدث خطأ ما",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteModal = (user) => {
    setDeleteModal({
      show: true,
      id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
    });
  };

  const confirmDelete = async () => {
    setActionLoading(true);
    try {
      await API.delete(`/admin/user/${deleteModal.id}`);
      setUsers(users.filter((u) => u._id !== deleteModal.id));
      showToastMessage(
        `تم حذف حساب ${roleLabel(deleteModal.role)} بنجاح`,
        "success",
      );
      setDeleteModal({ show: false, id: null, name: "", role: "" });
      fetchInitialData();
    } catch (err) {
      showToastMessage(
        err.response?.data?.message || "حدث خطأ أثناء إلغاء صلاحيات المستخدم",
        "error",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const checkActionPermission = (targetUser) => {
    if (isMaster) return true;
    if (targetUser.role === "admin") return false;
    return true;
  };

  const filteredUsers = users.filter(
    (u) =>
      `${u.firstName} ${u.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      u.nationalId.includes(searchTerm) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div
      className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans relative"
      dir="rtl"
    >
      {toast.show && (
        <div
          className={`fixed top-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border animate-slide-down text-sm font-bold ${toast.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-rose-50 border-rose-100 text-rose-800"}`}
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

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <ShieldCheck className="text-indigo-600" size={36} /> إدارة المستخدمين
            </h1>
            <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
              مركز التحكم في EduLink
            </p>
          </div>

          {isMaster && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Plus size={20} /> إضافة إداري جديد
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="الطلاب"
            value={stats.totalStudents}
            icon={<UserCircle />}
            color="blue"
          />
          <StatCard
            title="المعلمين"
            value={stats.totalTeachers}
            icon={<Users />}
            color="emerald"
          />
          <StatCard
            title="الإداريين"
            value={stats.totalAdmins}
            icon={<ShieldCheck />}
            color="indigo"
          />
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex flex-col lg:flex-row gap-6 justify-between">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto">
              <TabBtn
                active={activeRole === "all"}
                label="الكل"
                onClick={() => setActiveRole("all")}
              />
              <TabBtn
                active={activeRole === "teacher"}
                label="المعلمين"
                onClick={() => setActiveRole("teacher")}
              />
              <TabBtn
                active={activeRole === "parent"}
                label="أولياء الأمور"
                onClick={() => setActiveRole("parent")}
              />
              <TabBtn
                active={activeRole === "admin"}
                label="الإداريين"
                onClick={() => setActiveRole("admin")}
              />
            </div>
            <div className="relative w-full lg:w-96">
              <Search
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="ابحث بالاسم، الرقم القومي، أو اسم المستخدم..."
                className="w-full pr-12 pl-4 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-sm transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50/50 text-slate-400 text-xs font-black uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">بيانات المستخدم</th>
                  <th className="px-6 py-4">الرقم القومي</th>
                  <th className="px-6 py-4">بيانات التواصل</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="py-20 text-center">
                      <Loader2
                        className="animate-spin mx-auto text-indigo-500"
                        size={40}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const hasPermission = checkActionPermission(user);
                    return (
                      <tr
                        key={user._id}
                        className="hover:bg-slate-50/50 transition-colors group"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black">
                              {user.firstName[0]}
                            </div>
                            <div>
                              <p className="font-black text-slate-800">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-[10px] text-indigo-500 font-bold uppercase mt-0.5">
                                @{user.username}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-bold text-slate-600 text-xs">
                          {user.nationalId}
                        </td>
                        <td className="px-6 py-5 font-bold text-slate-600 text-xs">
                          {user.phoneNumber}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center justify-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                            {hasPermission ? (
                              <>
                                <button
                                  onClick={() => openEditModal(user)}
                                  className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(user)}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full font-bold">
                                <Lock size={12} className="text-slate-400" />{" "}
                                مقفول
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {!loading && filteredUsers.length === 0 && (
              <div className="py-20 text-center text-slate-400 font-bold tracking-wider">
                لا يوجد مستخدمين بهذا الدور
              </div>
            )}
          </div>
        </div>
      </div>

      {editModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-black flex items-center gap-2">
                <Edit /> تعديل الحساب
              </h2>
              <button
                disabled={actionLoading}
                onClick={() => setEditModal({ show: false, user: null })}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={handleEditUser}
              className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <Input
                label="الاسم الأول"
                value={editForm.firstName}
                onChange={(e) =>
                  setEditForm({ ...editForm, firstName: e.target.value })
                }
                type="text"
                pattern="^[A-Za-z؀-ۿ\s]+$"
                placeholder="أدخل الاسم الأول"
              />
              <Input
                label="الاسم الأخير"
                value={editForm.lastName}
                onChange={(e) =>
                  setEditForm({ ...editForm, lastName: e.target.value })
                }
                type="text"
                pattern="^[A-Za-z؀-ۿ\s]+$"
                placeholder="أدخل الاسم الأخير"
              />
              <Input
                label="رقم الهاتف"
                type="text"
                maxLength={11}
                minLength={11}
                value={editForm.phoneNumber}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    phoneNumber: e.target.value.replace(/\D/g, ""),
                  })
                }
                placeholder="رقم هاتف مكوّن من 11 رقم"
                pattern="[0-9]{11}"
              />
              <Input
                label="البريد الإلكتروني"
                type="email"
                placeholder="أدخل البريد الإلكتروني"
                pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                required
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
              />
              <button
                disabled={actionLoading}
                className="md:col-span-2 lg:col-span-3 mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Edit size={20} /> حفظ التعديلات
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-fade-in text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">
                إنهاء الحساب
              </h3>
              <p className="text-slate-400 font-medium text-sm mt-2">
                هل أنت متأكد من حذف {roleLabel(deleteModal.role)}{" "}
                <strong className="text-slate-700 font-bold">
                  {deleteModal.name}
                </strong>
                ؟ لا يمكن التراجع عن هذا التغيير الجذري.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                disabled={actionLoading}
                onClick={() =>
                  setDeleteModal({ show: false, id: null, name: "", role: "" })
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-black flex items-center gap-2">
                <ShieldCheck /> إضافة إداري فرعي جديد
              </h2>
              <button
                disabled={actionLoading}
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={handleAddUser}
              className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <Input
                label="الاسم الأول"
                value={userForm.firstName}
                onChange={(e) =>
                  setUserForm({ ...userForm, firstName: e.target.value })
                }
                type="text"
                pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                placeholder="أدخل الاسم الأول"
              />
              <Input
                label="الاسم الأخير"
                value={userForm.lastName}
                onChange={(e) =>
                  setUserForm({ ...userForm, lastName: e.target.value })
                }
                type="text"
                pattern="^[A-Za-z\u0600-\u06FF\s]+$"
                placeholder="أدخل الاسم الأخير"
              />
              <Input
                label="الرقم القومي"
                type="text"
                maxLength={14}
                minLength={14}
                placeholder="رقم قومي مكوّن من 14 رقم"
                pattern="[0-9]{14}"
                value={userForm.nationalId}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    nationalId: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
              <Input
                label="رقم الهاتف"
                type="text"
                maxLength={11}
                minLength={11}
                value={userForm.phoneNumber}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    phoneNumber: e.target.value.replace(/\D/g, ""),
                  })
                }
                placeholder="رقم هاتف مكوّن من 11 رقم"
                pattern="[0-9]{11}"
              />
              <div className="md:col-span-2 lg:col-span-3">
                <Input
                  label="البريد الإلكتروني (سيتم إرسال بيانات الدخول إليه)"
                  type="email"
                  placeholder="أدخل البريد الإلكتروني"
                  pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                  required
                  value={userForm.email}
                  onChange={(e) =>
                    setUserForm({ ...userForm, email: e.target.value })
                  }
                />
              </div>
              <button
                disabled={actionLoading}
                className="md:col-span-2 lg:col-span-3 mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Plus size={20} /> إنشاء حساب إداري
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes slideDown { from { transform: translateY(-1rem); opacity: 0; } to { transform: translateY(0); opacity: 1; } } @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } } .animate-slide-down { animation: slideDown 0.3s ease-out forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`,
        }}
      />
    </div>
  );
};

// المكونات الفرعية (StatCard, TabBtn, Input) تظل كما هي دون أي تعديل...
const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
  };
  return (
    <div className="p-6 rounded-[2rem] border-2 bg-white flex items-center gap-5 shadow-sm transition-transform hover:scale-[1.02]">
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${colors[color]}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          {title}
        </p>
        <p className="text-2xl font-black text-slate-800 tracking-tight">
          {value}
        </p>
      </div>
    </div>
  );
};
const TabBtn = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={`px-6 py-3 rounded-xl text-xs font-black transition-all whitespace-nowrap ${active ? "bg-white text-indigo-600 shadow-sm shadow-indigo-500/5" : "text-slate-400 hover:text-slate-600"}`}
  >
    {label}
  </button>
);
const Input = ({ label, type = "text", ...props }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-black text-slate-400 mr-2 uppercase tracking-widest">
      {label}
    </label>
    <input
      type={type}
      required={type !== "email"}
      className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold text-sm transition-all"
      {...props}
    />
  </div>
);

export default AdminPage;
