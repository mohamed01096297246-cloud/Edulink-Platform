import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Bell,
  Send,
  Users,
  User,
  Trash2,
  Edit,
  Plus,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
} from "lucide-react";

const AdminNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // States جديدة خاصة بعملية البحث والتصفية لأولياء الأمور
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [formData, setFormData] = useState({
    title: "",
    message: "",
    target: "all",
    parentId: "",
  });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const notifRes = await API.get("/notifications");
      const fetchedNotifs = notifRes.data?.data || notifRes.data || [];
      setNotifications(fetchedNotifs);

      const parentsRes = await API.get("/admin/users?role=parent");
      const fetchedParents =
        parentsRes.data?.data ||
        parentsRes.data?.users ||
        parentsRes.data ||
        [];
      setParents(fetchedParents);
    } catch (err) {
      console.error("خطأ في جلب البيانات:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const response = await API.put(`/notifications/${editingId}`, {
          title: formData.title,
          message: formData.message,
        });
        showToast(response.data.message || "تم تحديث الإشعار بنجاح", "success");
      } else {
        const response = await API.post("/notifications", formData);
        showToast(response.data.message || "تم إرسال الإشعار بنجاح", "success");
      }
      closeModal();
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || "فشلت العملية", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await API.delete(`/notifications/${deleteId}`);
      showToast(response.data.message || "تم حذف الإشعار بنجاح", "success");
      setNotifications(notifications.filter((n) => n._id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      showToast(err.response?.data?.message || "فشل الحذف", "error");
      setDeleteId(null);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setSearchQuery("");
    setIsDropdownOpen(false);
    setFormData({ title: "", message: "", target: "all", parentId: "" });
  };

  // تصفية الآباء بناءً على جملة البحث المدخلة
  const filteredParents = parents.filter((p) => {
    const fullName = (
      p.name || `${p.firstName || ""} ${p.lastName || ""}`
    ).toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
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
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <AlertCircle size={20} className="text-rose-600" />
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Bell className="text-blue-600" size={36} /> الإشعارات
            </h1>
            <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
              مركز البث في EduLink
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
          >
            <Plus size={20} /> إشعار جديد
          </button>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 min-h-[400px]">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <AlertCircle size={48} className="mb-4 opacity-20" />
              <p className="font-bold">لا يوجد إشعارات</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {notifications.map((n) => (
                <div
                  key={n._id}
                  className="group bg-slate-50/50 hover:bg-white border border-transparent hover:border-blue-100 p-6 rounded-[2rem] transition-all flex flex-col md:flex-row justify-between gap-4"
                >
                  <div className="flex gap-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        n.target === "all"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-amber-100 text-amber-600"
                      }`}
                    >
                      {n.target === "all" ? (
                        <Users size={20} />
                      ) : (
                        <User size={20} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                            n.target === "all"
                              ? "bg-blue-600 text-white"
                              : "bg-amber-500 text-white"
                          }`}
                        >
                          {n.target === "all" ? "للجميع" : "خاص"}
                        </span>
                        <h3 className="font-black text-slate-800">{n.title}</h3>
                      </div>
                      <p className="text-slate-500 text-sm font-medium">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">
                        بواسطة: {n.createdBy?.name || "الإدارة"} •{" "}
                        {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity self-end md:self-start">
                    <button
                      onClick={() => {
                        setEditingId(n._id);
                        setFormData({
                          title: n.title,
                          message: n.message,
                          target: n.target,
                          parentId: n.parent?._id || n.parent || "",
                        });
                        setShowModal(true);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => setDeleteId(n._id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-black">
                {editingId ? "تعديل الإشعار" : "إشعار جديد"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {!editingId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    الجهة المستهدفة
                  </label>
                  <select
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm"
                    value={formData.target}
                    onChange={(e) =>
                      setFormData({ ...formData, target: e.target.value })
                    }
                  >
                    <option value="all">كل أولياء الأمور</option>
                    <option value="parent">ولي أمر محدد</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  العنوان
                </label>
                <input
                  type="text"
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>
              </div>

              {/* حقل اختيار الأب المطور مع ميزة البحث السريع */}
              {formData.target === "parent" && !editingId && (
                <div className="space-y-1.5 relative animate-in slide-in-from-top-2">
                  <label className="text-xs font-black text-slate-400 uppercase mr-2">
                    ابحث واختر ولي الأمر
                  </label>

                  {/* حاوية حقل البحث الإدخالي */}
                  <div className="relative flex items-center">
                    <Search
                      size={16}
                      className="absolute right-4 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder={
                        formData.parentId
                          ? parents.find((p) => p._id === formData.parentId)
                              ?.name || "تم اختيار ولي الأمر"
                          : "اكتب اسم ولي الأمر للفلترة..."
                      }
                      className="w-full pr-11 pl-4 py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm text-slate-700 placeholder-slate-500"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                    />
                    {formData.parentId && (
                      <span className="absolute left-4 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md font-black">
                        تم الاختيار
                      </span>
                    )}
                  </div>

                  {/* القائمة المنسدلة المخصصة لعرض نتائج البحث */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto z-50 p-2 space-y-1 animate-in fade-in duration-100">
                      {filteredParents.length > 0 ? (
                        filteredParents.map((p) => {
                          const pName =
                            p.name ||
                            `${p.firstName || ""} ${p.lastName || ""}`;
                          return (
                            <button
                              key={p._id}
                              type="button"
                              className={`w-full text-right p-3 rounded-xl font-bold text-xs transition-all flex items-center justify-between ${
                                formData.parentId === p._id
                                  ? "bg-indigo-50 text-indigo-600"
                                  : "text-slate-600 hover:bg-slate-50"
                              }`}
                              onClick={() => {
                                setFormData({ ...formData, parentId: p._id });
                                setSearchQuery(pName); // ملء الحقل باسم الأب المختار لراحة المستخدم
                                setIsDropdownOpen(false);
                              }}
                            >
                              <span>{pName}</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                ID: {p._id.slice(-6)}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-slate-400 text-xs font-medium">
                          لا يوجد أولياء أمور مطابقين للبحث
                        </div>
                      )}
                    </div>
                  )}
                  {/* حقل خفي لضمان التحقق من صحة الفورم ومطالبته بالاختيار قبل الإرسال */}
                  <input type="hidden" required value={formData.parentId} />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase mr-2">
                  الرسالة
                </label>
                <textarea
                  rows="4"
                  required
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm resize-none"
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                />
              </div>

              <button className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                <Send size={18} /> {editingId ? "تحديث" : "إرسال الآن"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-6 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                حذف الإشعار
              </h3>
              <p className="text-sm font-medium text-slate-500">
                هل أنت متأكد من حذف هذا الإشعار؟ لا يمكن التراجع عن هذا الإجراء.
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
    </div>
  );
};

export default AdminNotifications;
