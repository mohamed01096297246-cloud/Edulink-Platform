import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Building2,
  GraduationCap,
  Users,
  UserCog,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

// The platform owner's actual landing page — distinct from AdminOverview,
// which is scoped to one school and means nothing to a super-admin who
// isn't attached to any single school. This is the one screen that answers
// "how is EduLink doing across every school", not "how is my school doing
// today".
const PlatformOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await API.get("/schools/overview");
        setData(res.data);
      } catch (err) {
        setError(
          err.response?.data?.message || "تعذّر تحميل نظرة عامة على المنصة.",
        );
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
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

  const { totals, schools, recentSchools } = data;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <Sparkles className="text-blue-600" size={36} /> نظرة عامة على المنصة
          </h1>
          <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">
            كل المدارس على EduLink
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="المدارس"
            value={totals.schools}
            icon={<Building2 />}
            color="blue"
          />
          <StatCard
            title="إجمالي الطلاب"
            value={totals.students}
            icon={<GraduationCap />}
            color="emerald"
          />
          <StatCard
            title="إجمالي المعلمين"
            value={totals.teachers}
            icon={<Users />}
            color="indigo"
          />
          <StatCard
            title="إجمالي أولياء الأمور"
            value={totals.parents}
            icon={<UserCog />}
            color="rose"
          />
        </div>

        {recentSchools.length > 0 && (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-6">
              <Building2 size={20} className="text-blue-600" /> أحدث المدارس المنضمّة
            </h2>
            <div className="space-y-3">
              {recentSchools.map((s) => (
                <div
                  key={s._id}
                  className="bg-slate-50/60 rounded-2xl p-5 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-black text-slate-800">{s.name}</p>
                    <p className="text-slate-500 text-sm font-medium mt-0.5">
                      كود: {s.code} · {s.studentsCount} طالب · {s.teachersCount} معلم
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleDateString("ar-EG-u-nu-latn")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-6">
            <Building2 size={20} className="text-blue-600" /> كل المدارس
          </h2>

          {schools.length === 0 ? (
            <p className="text-slate-400 font-bold text-sm py-6 text-center">
              لا يوجد مدارس مسجّلة بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="pb-4">المدرسة</th>
                    <th className="pb-4">الكود</th>
                    <th className="pb-4">الخطة</th>
                    <th className="pb-4">الطلاب</th>
                    <th className="pb-4">المعلمين</th>
                    <th className="pb-4">الحالة</th>
                    <th className="pb-4">تاريخ الإضافة</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s) => (
                    <tr key={s._id} className="border-t border-slate-100">
                      <td className="py-4 font-black text-slate-800">{s.name}</td>
                      <td className="py-4 text-slate-500 font-bold text-sm">{s.code}</td>
                      <td className="py-4 text-slate-500 font-bold text-sm">
                        {s.plan === "owned" ? "تملّك" : "اشتراك"}
                      </td>
                      <td className="py-4 text-slate-700 font-bold text-sm">{s.studentsCount}</td>
                      <td className="py-4 text-slate-700 font-bold text-sm">{s.teachersCount}</td>
                      <td className="py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                            s.active
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-rose-50 text-rose-600"
                          }`}
                        >
                          {s.active ? "نشطة" : "موقوفة"}
                        </span>
                      </td>
                      <td className="py-4 text-slate-400 font-bold text-xs">
                        {new Date(s.createdAt).toLocaleDateString("ar-EG-u-nu-latn")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };
  return (
    <div className="p-6 rounded-[2rem] border-2 bg-white flex items-center gap-5 shadow-sm">
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colors[color]}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          {title}
        </p>
        <p className="text-2xl font-black text-slate-800 tracking-tight">
          {value ?? 0}
        </p>
      </div>
    </div>
  );
};

export default PlatformOverview;
