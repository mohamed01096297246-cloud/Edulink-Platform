import React, { useState, useEffect, useCallback } from "react";
import API from "../../api/axios";
import {
  UserCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";

const todayISO = () => new Date().toISOString().split("T")[0];

const STATUS_OPTIONS = [
  { value: "present", label: "حاضر", color: "emerald" },
  { value: "late", label: "متأخر", color: "amber" },
  { value: "absent", label: "غائب", color: "rose" },
];

// Daily teacher check-in, plus the part that actually saves the school's
// day: when a teacher is marked absent, show exactly which class periods
// they leave uncovered today and who's free to step in.
const TeacherAttendanceManager = () => {
  const [teachers, setTeachers] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [statusMap, setStatusMap] = useState({});
  const [coverage, setCoverage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToastMessage = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [teachersRes, attendanceRes, coverageRes] = await Promise.all([
        API.get("/teacher"),
        API.get("/staff-attendance", { params: { date } }),
        API.get("/staff-attendance/coverage", { params: { date } }),
      ]);

      const teacherList = teachersRes.data.data || [];
      setTeachers(teacherList);

      const map = {};
      teacherList.forEach((t) => {
        map[t._id] = "present";
      });
      (attendanceRes.data.data || []).forEach((record) => {
        map[record.teacher._id] = record.status;
      });
      setStatusMap(map);

      setCoverage(coverageRes.data.coverage || []);
    } catch (err) {
      console.error("Fetch error:", err);
      showToastMessage("فشل تحميل حضور الموظفين", "error");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = Object.entries(statusMap).map(([teacherId, status]) => ({
        teacherId,
        status,
      }));
      await API.post("/staff-attendance/bulk", { date, records });
      showToastMessage("تم حفظ الحضور بنجاح");
      fetchAll();
    } catch (err) {
      showToastMessage(err.response?.data?.message || "حدث خطأ ما", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignSubstitute = async (scheduleId, substituteTeacherId) => {
    try {
      await API.post("/staff-attendance/substitutions", {
        scheduleId,
        date,
        substituteTeacherId,
      });
      showToastMessage("تم تعيين البديل بنجاح");
      fetchAll();
    } catch (err) {
      showToastMessage(err.response?.data?.message || "حدث خطأ ما", "error");
    }
  };

  const handleRemoveSubstitute = async (substitutionId) => {
    try {
      await API.delete(`/staff-attendance/substitutions/${substitutionId}`);
      showToastMessage("تم إلغاء البديل");
      fetchAll();
    } catch (err) {
      showToastMessage(err.response?.data?.message || "حدث خطأ ما", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      {toast.show && (
        <div
          className={`fixed top-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border text-sm font-bold ${toast.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-rose-50 border-rose-100 text-rose-800"}`}
        >
          {toast.type === "success" ? <CheckCircle2 className="text-emerald-500" size={20} /> : <XCircle className="text-rose-500" size={20} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast({ show: false, message: "", type: "success" })} className="mr-2 p-1 hover:bg-black/5 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <UserCheck className="text-indigo-600" size={36} /> حضور المعلمين
            </h1>
            <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
              تسجيل حضور المعلمين وتغطية البدلاء
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-sm"
          />
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
              المعلمين
            </h2>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} حفظ الحضور
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
          ) : teachers.length === 0 ? (
            <p className="text-slate-400 font-bold text-sm py-10 text-center">لا يوجد معلمين مسجّلين بعد.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {teachers.map((t) => (
                <div key={t._id} className="flex items-center justify-between py-4 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black shrink-0">
                      {t.firstName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 truncate">{t.firstName} {t.lastName}</p>
                      <p className="text-[11px] text-slate-400 font-bold truncate">{t.subject?.name || "—"}</p>
                    </div>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setStatusMap({ ...statusMap, [t._id]: opt.value })}
                        className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all ${
                          statusMap[t._id] === opt.value
                            ? opt.color === "emerald"
                              ? "bg-emerald-500 text-white"
                              : opt.color === "amber"
                              ? "bg-amber-500 text-white"
                              : "bg-rose-500 text-white"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {coverage.length > 0 && (
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-amber-100">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-1 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} /> حصص تحتاج تغطية
            </h2>
            <p className="text-xs text-slate-400 font-bold mb-4">
              هذه الحصص هيفضلوا من غير معلم النهاردة — عيّن بديل من تحت.
            </p>
            <div className="space-y-3">
              {coverage.map(({ schedule, existingSubstitution, availableSubstitutes }) => (
                <div key={schedule._id} className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-800 text-sm">
                      {schedule.subject?.name} — {schedule.classroom?.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <Clock size={12} /> {schedule.startTime} – {schedule.endTime} &nbsp;•&nbsp; غائب: {schedule.teacher?.firstName} {schedule.teacher?.lastName}
                    </p>
                  </div>

                  {existingSubstitution ? (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600">
                        مغطاة بواسطة {existingSubstitution.substituteTeacher.firstName} {existingSubstitution.substituteTeacher.lastName}
                      </span>
                      <button
                        onClick={() => handleRemoveSubstitute(existingSubstitution._id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="إلغاء البديل"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  ) : availableSubstitutes.length === 0 ? (
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
                      لا يوجد معلم متاح
                    </span>
                  ) : (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) handleAssignSubstitute(schedule._id, e.target.value);
                      }}
                      className="p-2.5 bg-white border border-amber-200 rounded-xl outline-none font-bold text-xs"
                    >
                      <option value="" disabled>
                        عيّن بديلًا...
                      </option>
                      {availableSubstitutes.map((sub) => (
                        <option key={sub._id} value={sub._id}>
                          {sub.firstName} {sub.lastName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherAttendanceManager;
