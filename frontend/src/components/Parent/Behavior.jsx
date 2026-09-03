import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Loader2,
  Smile,
  Frown,
  Meh,
  Award,
  Calendar,
  User,
  BookOpen,
  Filter,
} from "lucide-react";
import { API_URL } from "../../api/axios";

const Behavior = ({ studentId }) => {
  const [behaviors, setBehaviors] = useState([]);
  const [loading, setLoading] = useState(true);
  // إضافة State لتخزين نوع الفلتر الحالي (all, positive, negative)
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    if (studentId) {
      fetchStudentBehavior();
    } else {
      setBehaviors([]);
    }
    // إعادة تعيين الفلتر عند تغيير الطالب
    setFilterType("all");
  }, [studentId]);

  const fetchStudentBehavior = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/behavior/student/${studentId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = res.data?.data || res.data?.records || res.data || [];
      setBehaviors(data);
    } catch (err) {
      console.error("Error fetching behaviors:", err);
      setBehaviors([]);
    } finally {
      setLoading(false);
    }
  };

  const totalPositive = behaviors.filter((b) => b.type === "positive").length;
  const totalNegative = behaviors.filter((b) => b.type === "negative").length;

  // تصفية المصفوفة ديناميكياً بناءً على اختيار ولي الأمر
  const filteredBehaviors = behaviors.filter((b) => {
    if (filterType === "all") return true;
    return b.type === filterType;
  });

  const getBehaviorDetails = (type) => {
    switch (type) {
      case "positive":
        return {
          icon: <Smile className="text-emerald-500" size={24} />,
          bgColor: "bg-emerald-50 border-emerald-100",
          badge: "bg-emerald-500 text-white",
          text: "Positive Observation",
        };
      case "negative":
        return {
          icon: <Frown className="text-rose-500" size={24} />,
          bgColor: "bg-rose-50 border-rose-100",
          badge: "bg-rose-500 text-white",
          text: "Needs Improvement",
        };
      default:
        return {
          icon: <Meh className="text-amber-500" size={24} />,
          bgColor: "bg-amber-50 border-amber-100",
          badge: "bg-amber-500 text-white",
          text: "Neutral Note",
        };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin mb-4 text-indigo-600" size={40} />
        <p className="font-bold tracking-tight">
          Loading Behavioral History...
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
      dir="ltr"
    >
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
          <Award className="text-indigo-600" size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800">
            Behavioral Report
          </h2>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">
            Monitor classroom evaluations and notes
          </p>
        </div>
      </div>

      {behaviors.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 p-12 rounded-[2.5rem] text-center">
          <Smile className="mx-auto text-slate-300 mb-3" size={48} />
          <h3 className="text-lg font-black text-slate-700">All Clear!</h3>
          <p className="text-slate-400 font-medium text-sm">
            No specific behavioral observations or notes have been logged for
            this student yet.
          </p>
        </div>
      ) : (
        <>
          {/* كروت الإحصائيات (تتحول لأزرار تصفية سريعة عند الضغط عليها لراحة المستخدم) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() =>
                setFilterType(filterType === "positive" ? "all" : "positive")
              }
              className={`p-5 rounded-2xl flex items-center justify-between border transition-all text-left w-full ${
                filterType === "positive"
                  ? "bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-500/20 shadow-md"
                  : "bg-white border-slate-100 shadow-sm hover:border-emerald-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <Smile className="text-emerald-500" size={24} />
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-black uppercase tracking-wider block">
                    Positive Remarks
                  </span>
                  <span className="text-2xl font-black text-slate-800">
                    {totalPositive}
                  </span>
                </div>
              </div>
            </button>

            <button
              onClick={() =>
                setFilterType(filterType === "negative" ? "all" : "negative")
              }
              className={`p-5 rounded-2xl flex items-center justify-between border transition-all text-left w-full ${
                filterType === "negative"
                  ? "bg-rose-50/60 border-rose-300 ring-2 ring-rose-500/20 shadow-md"
                  : "bg-white border-slate-100 shadow-sm hover:border-rose-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-50 rounded-xl">
                  <Frown className="text-rose-500" size={24} />
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-black uppercase tracking-wider block">
                    Attention Required
                  </span>
                  <span className="text-2xl font-black text-slate-800">
                    {totalNegative}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* شريط أدوات التصفية التفصيلي (Filter Navigation Bar) */}
          <div className="flex items-center justify-between bg-slate-50 p-2 rounded-2xl border border-slate-200/60">
            <div className="flex items-center gap-2 pl-2 text-slate-500 font-bold text-xs uppercase tracking-wider">
              <Filter size={14} className="text-indigo-500" />
              <span>Filter view:</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilterType("all")}
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  filterType === "all"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/40"
                }`}
              >
                All ({behaviors.length})
              </button>
              <button
                onClick={() => setFilterType("positive")}
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  filterType === "positive"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-white text-emerald-600 hover:bg-emerald-50 border border-slate-200/40"
                }`}
              >
                Positive ({totalPositive})
              </button>
              <button
                onClick={() => setFilterType("negative")}
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  filterType === "negative"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-white text-rose-600 hover:bg-rose-50 border border-slate-200/40"
                }`}
              >
                Needs Improvement ({totalNegative})
              </button>
            </div>
          </div>

          {/* قائمة السلوكيات المفلترة */}
          <div className="space-y-4">
            {filteredBehaviors.length === 0 ? (
              <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-[2rem] bg-white">
                <Meh className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="text-slate-400 font-bold text-sm">
                  No records match the selected filter criteria.
                </p>
              </div>
            ) : (
              filteredBehaviors.map((b) => {
                const details = getBehaviorDetails(b.type);
                return (
                  <div
                    key={b._id}
                    className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-200 transition-all"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div
                        className={`p-4 rounded-2xl border ${details.bgColor} flex-shrink-0 shadow-sm`}
                      >
                        {details.icon}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${details.badge}`}
                          >
                            {details.text}
                          </span>
                          <div className="flex items-center gap-1 text-slate-500 font-bold text-sm bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                            <BookOpen size={14} className="text-indigo-500" />
                            {b.subject?.name || "General Subject"}
                          </div>
                        </div>
                        <p className="text-slate-700 font-bold text-base leading-relaxed pt-1">
                          {b.note}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium pt-1">
                          <User size={14} className="text-slate-300" />
                          <span>Logged by:</span>
                          <span className="text-slate-600 font-bold">
                            {b.teacher?.firstName} {b.teacher?.lastName}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl self-start md:self-center">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="text-xs font-black text-slate-500">
                        {new Date(b.date || b.createdAt).toLocaleDateString(
                          "en-CA",
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Behavior;
