import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Clock,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Coffee,
} from "lucide-react";

// مواعيد الجرس: كل مجموعة بتحدد ميعاد كل حصة لمراحل معينة في أيام معينة.
// المواعيد بتختلف حسب المرحلة وحسب اليوم (عدد الحصص، مدتها، الفسحة)، فمفيش
// معادلة — ده المصدر الوحيد لمواعيد الحصص، وصفحة الجدول بتقرا منه. تعديل أي
// مجموعة بيعدّل مواعيد الحصص المتسجلة في الجدول تلقائيًا.

const DAYS = [
  ["sun", "الأحد"],
  ["mon", "الاثنين"],
  ["tue", "الثلاثاء"],
  ["wed", "الأربعاء"],
  ["thu", "الخميس"],
];
const PERIOD_NAMES = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];

const toMinutes = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};
const minutesBetween = (a, b) => toMinutes(b) - toMinutes(a);

const EMPTY_FORM = {
  name: "",
  grades: [],
  days: [],
  periods: [{ startTime: "08:00", endTime: "08:50" }],
  breaks: [],
};

const BellScheduleManager = () => {
  const [bells, setBells] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 5000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bellRes, gradeRes] = await Promise.all([
        API.get("/bell-schedules"),
        API.get("/grades"),
      ]);
      setBells(bellRes.data.data || []);
      setGrades(gradeRes.data.data || []);
    } catch (err) {
      showToast("فشل تحميل مواعيد الحصص", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- form helpers ---
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (bell) => {
    setEditingId(bell._id);
    setForm({
      name: bell.name,
      grades: (bell.grades || []).map((g) => g._id || g),
      days: bell.days || [],
      periods: [...(bell.periods || [])]
        .sort((a, b) => a.period - b.period)
        .map((p) => ({ startTime: p.startTime, endTime: p.endTime })),
      breaks: (bell.breaks || []).map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
    });
    setFormError("");
    setModalOpen(true);
  };

  const toggleIn = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const setRow = (key, index, field, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));

  const removeRow = (key, index) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== index) }));

  // الحصة الجديدة بتبدأ مكان ما اللي قبلها خلصت، وبنفس مدتها — عشان تكتب أقل.
  const addPeriod = () =>
    setForm((f) => {
      const last = f.periods[f.periods.length - 1];
      if (!last?.endTime) return { ...f, periods: [...f.periods, { startTime: "", endTime: "" }] };
      const length = last.startTime ? minutesBetween(last.startTime, last.endTime) : 50;
      const start = toMinutes(last.endTime);
      const end = start + (length > 0 ? length : 50);
      const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return { ...f, periods: [...f.periods, { startTime: fmt(start), endTime: fmt(end) }] };
    });

  const addBreak = () =>
    setForm((f) => ({ ...f, breaks: [...f.breaks, { startTime: "", endTime: "" }] }));

  const handleSave = async () => {
    setFormError("");
    const payload = {
      name: form.name,
      grades: form.grades,
      days: form.days,
      periods: form.periods.map((p, i) => ({ period: i + 1, ...p })),
      breaks: form.breaks,
    };
    setSaving(true);
    try {
      const res = editingId
        ? await API.put(`/bell-schedules/${editingId}`, payload)
        : await API.post("/bell-schedules", payload);
      showToast(res.data.message, "success");
      setModalOpen(false);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await API.delete(`/bell-schedules/${deleteTarget._id}`);
      showToast(res.data.message, "success");
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || "فشل الحذف", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  // --- coverage: which set of times applies to each grade on each day ---
  const coverage = (gradeId, day) =>
    bells.find(
      (b) => (b.grades || []).some((g) => (g._id || g) === gradeId) && (b.days || []).includes(day),
    );

  // periods and breaks merged in time order, for display
  const timeline = (bell) =>
    [
      ...(bell.periods || []).map((p) => ({ ...p, kind: "period" })),
      ...(bell.breaks || []).map((b) => ({ ...b, kind: "break" })),
    ].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[80] max-w-xl w-[calc(100%-2rem)]">
          <div
            className={`flex items-start gap-3 px-6 py-4 rounded-2xl shadow-xl border ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Clock className="text-indigo-600" size={36} /> مواعيد الحصص
            </h1>
            <p className="text-slate-400 font-medium text-sm mt-1">
              ميعاد كل حصة والفسحة لكل مرحلة في كل يوم. أي تعديل هنا بيعدّل مواعيد الجدول الدراسي تلقائيًا.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> مجموعة مواعيد جديدة
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 flex justify-center py-40">
            <Loader2 className="animate-spin text-indigo-500" size={48} />
          </div>
        ) : (
          <>
            {/* خريطة التغطية */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 overflow-x-auto">
              <h3 className="font-black text-slate-700 text-sm mb-3">مين ماشي على أنهي مواعيد</h3>
              <table className="w-full text-right text-xs min-w-[560px]">
                <thead>
                  <tr className="text-slate-400">
                    <th className="p-2 font-black">المرحلة</th>
                    {DAYS.map(([key, label]) => (
                      <th key={key} className="p-2 font-black text-center">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {grades.map((g) => (
                    <tr key={g._id}>
                      <td className="p-2 font-black text-slate-700 whitespace-nowrap">{g.name}</td>
                      {DAYS.map(([key]) => {
                        const bell = coverage(g._id, key);
                        return (
                          <td key={key} className="p-1.5 text-center">
                            {bell ? (
                              <span className="inline-block bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 font-bold">
                                {bell.periods.length} حصص
                              </span>
                            ) : (
                              <span className="inline-block bg-rose-50 text-rose-600 rounded-lg px-2 py-1 font-bold">
                                مش متحدد
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {bells.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] border border-slate-100 text-center py-24 text-slate-400 font-bold">
                مفيش مواعيد حصص متحددة لسه. اضغط "مجموعة مواعيد جديدة".
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {bells.map((bell) => (
                  <div key={bell._id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 min-w-0">
                        <h3 className="font-black text-slate-800">{bell.name}</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {(bell.grades || []).map((g) => (
                            <span key={g._id} className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                              {g.name}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {DAYS.filter(([k]) => bell.days.includes(k)).map(([k, label]) => (
                            <span key={k} className="text-[11px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg">
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(bell)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          title="تعديل"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(bell)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="حذف"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-50 border border-slate-100 rounded-2xl overflow-hidden">
                      {timeline(bell).map((row, i) =>
                        row.kind === "break" ? (
                          <div key={`b${i}`} className="flex items-center justify-between px-4 py-2 bg-amber-50/70 text-amber-700">
                            <span className="text-xs font-black flex items-center gap-1.5">
                              <Coffee size={13} /> الفسحة
                            </span>
                            <span className="text-xs font-bold tabular-nums" dir="ltr">
                              {row.startTime} – {row.endTime}
                            </span>
                          </div>
                        ) : (
                          <div key={`p${row.period}`} className="flex items-center justify-between px-4 py-2">
                            <span className="text-xs font-black text-slate-700">الحصة {PERIOD_NAMES[row.period]}</span>
                            <span className="text-xs font-bold text-slate-500 tabular-nums flex items-center gap-2" dir="ltr">
                              {row.startTime} – {row.endTime}
                              <span className="text-[10px] text-slate-300">{minutesBetween(row.startTime, row.endTime)}m</span>
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* نافذة الإضافة/التعديل */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-7 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? "تعديل مجموعة المواعيد" : "مجموعة مواعيد جديدة"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X />
              </button>
            </div>

            <div className="p-7 overflow-y-auto space-y-6">
              {formError && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2 text-rose-700 font-bold text-sm">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 mr-2">الاسم</label>
                <input
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-slate-700"
                  placeholder="مثال: أولى إلى تالتة — الأحد والاثنين والثلاثاء"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 mr-2">المراحل</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {grades.map((g) => (
                      <label key={g._id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl cursor-pointer text-sm font-bold text-slate-700">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-indigo-600"
                          checked={form.grades.includes(g._id)}
                          onChange={() => toggleIn("grades", g._id)}
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 mr-2">الأيام</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {DAYS.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl cursor-pointer text-sm font-bold text-slate-700">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-indigo-600"
                          checked={form.days.includes(key)}
                          onChange={() => toggleIn("days", key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 mr-2">الحصص</label>
                {form.periods.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm font-black text-slate-600">الحصة {PERIOD_NAMES[i + 1]}</span>
                    <input
                      type="time"
                      className="flex-1 p-2.5 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm"
                      value={p.startTime}
                      onChange={(e) => setRow("periods", i, "startTime", e.target.value)}
                    />
                    <span className="text-slate-300 font-bold">←</span>
                    <input
                      type="time"
                      className="flex-1 p-2.5 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm"
                      value={p.endTime}
                      onChange={(e) => setRow("periods", i, "endTime", e.target.value)}
                    />
                    <span className="w-10 text-[11px] font-bold text-slate-400 text-center tabular-nums">
                      {p.startTime && p.endTime ? `${minutesBetween(p.startTime, p.endTime)}د` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow("periods", i)}
                      disabled={i !== form.periods.length - 1 || form.periods.length === 1}
                      title="بتتشال من آخر حصة بس"
                      className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl disabled:opacity-20 disabled:hover:bg-transparent"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPeriod}
                  disabled={form.periods.length >= 12}
                  className="flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-xl"
                >
                  <Plus size={14} /> إضافة حصة
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 mr-2">الفسحة</label>
                {form.breaks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm font-black text-amber-600 flex items-center gap-1">
                      <Coffee size={14} /> الفسحة
                    </span>
                    <input
                      type="time"
                      className="flex-1 p-2.5 bg-amber-50/60 rounded-xl border-2 border-transparent focus:border-amber-400 outline-none font-bold text-sm"
                      value={b.startTime}
                      onChange={(e) => setRow("breaks", i, "startTime", e.target.value)}
                    />
                    <span className="text-slate-300 font-bold">←</span>
                    <input
                      type="time"
                      className="flex-1 p-2.5 bg-amber-50/60 rounded-xl border-2 border-transparent focus:border-amber-400 outline-none font-bold text-sm"
                      value={b.endTime}
                      onChange={(e) => setRow("breaks", i, "endTime", e.target.value)}
                    />
                    <span className="w-10" />
                    <button
                      type="button"
                      onClick={() => removeRow("breaks", i)}
                      className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addBreak}
                  className="flex items-center gap-1.5 text-xs font-black text-amber-600 hover:bg-amber-50 px-3 py-2 rounded-xl"
                >
                  <Plus size={14} /> إضافة فسحة
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {editingId ? "حفظ التعديلات" : "حفظ المواعيد"}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-6 text-center space-y-5">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">حذف "{deleteTarget.name}"</h3>
              <p className="text-sm font-medium text-slate-500">
                لو فيه حصص متسجلة في الجدول بتعتمد على المواعيد دي، الحذف هيترفض لحد ما تنقلها أو تمسحها.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl"
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

export default BellScheduleManager;
