import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  CheckCircle2,
  XCircle,
  BellRing,
  Loader2,
  AlertCircle,
} from "lucide-react";

// The screen an admin actually lands on after logging in — a quick read
// on how the school is doing today, instead of dropping them straight
// into account administration.
const AdminOverview = () => {
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await API.get("/admin/dashboard");
        setStats(res.data.stats);
        setNotifications(res.data.latestNotifications || []);
      } catch (err) {
        setError(
          err.response?.data?.message || "تعذّر تحميل النظرة العامة.",
        );
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-rose-50 border border-rose-100 rounded-[2rem] p-10 text-center max-w-md">
          <AlertCircle className="mx-auto text-rose-500 mb-4" size={40} />
          <p className="font-bold text-rose-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <LayoutDashboard className="text-blue-600" size={36} /> نظرة عامة
          </h1>
          <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
            وضع اليوم
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AttendanceGroupCard
            title="الطلاب"
            icon={<GraduationCap />}
            color="blue"
            total={stats.totalStudents}
            present={stats.studentsPresent}
            absent={stats.studentsAbsent}
          />
          <AttendanceGroupCard
            title="المعلمين"
            icon={<Users />}
            color="indigo"
            total={stats.totalTeachers}
            present={stats.teachersPresent}
            absent={stats.teachersAbsent}
          />
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-6">
            <BellRing size={20} className="text-blue-600" /> أحدث الإشعارات
          </h2>

          {notifications.length === 0 ? (
            <p className="text-slate-400 font-bold text-sm py-6 text-center">
              لا يوجد إشعارات مُرسلة بعد.
            </p>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n._id}
                  className="bg-slate-50/60 rounded-2xl p-5 flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="font-black text-slate-800">{n.title}</p>
                    <p className="text-slate-500 text-sm font-medium mt-0.5">
                      {n.message}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// One grouped card per audience (students / teachers) — the headline count
// plus how many of them are marked present/absent *today*, instead of
// scattering those numbers across separate boxes with no shared context.
const AttendanceGroupCard = ({ title, icon, color, total, present, absent }) => {
  const headerColors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
  };
  const notMarked = Math.max((total ?? 0) - (present ?? 0) - (absent ?? 0), 0);

  return (
    <div className="rounded-[2rem] border-2 border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="p-6 flex items-center gap-5 border-b border-slate-100">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${headerColors[color]}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            {title}
          </p>
          <p className="text-2xl font-black text-slate-800 tracking-tight">
            {total ?? 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100">
        <SubStat
          label="حاضر اليوم"
          value={present}
          icon={<CheckCircle2 size={16} />}
          color="emerald"
        />
        <SubStat
          label="غائب اليوم"
          value={absent}
          icon={<XCircle size={16} />}
          color="rose"
        />
        <SubStat label="لم يُسجَّل" value={notMarked} color="slate" />
      </div>
    </div>
  );
};

const SubStat = ({ label, value, icon, color }) => {
  const textColors = {
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    slate: "text-slate-400",
  };
  return (
    <div className="p-5 text-center">
      <div
        className={`flex items-center justify-center gap-1.5 text-lg font-black ${textColors[color]}`}
      >
        {icon}
        {value ?? 0}
      </div>
      <p className="text-[10px] font-bold text-slate-400 mt-1">{label}</p>
    </div>
  );
};

export default AdminOverview;
