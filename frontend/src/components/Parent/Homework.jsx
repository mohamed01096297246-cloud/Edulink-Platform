import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Loader2,
  Award,
  MessageSquare,
} from "lucide-react";

function Homework({ studentId }) {
  const [activeHomeworks, setActiveHomeworks] = useState([]);
  const [gradedHomeworks, setGradedHomeworks] = useState([]);
  const [activeTab, setActiveTab] = useState("active"); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api";

  useEffect(() => {
    if (studentId) {
      fetchHomeworkData();
    } else {
      setLoading(false);
    }
  }, [studentId]);

  const fetchHomeworkData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [homeworkRes, resultRes] = await Promise.all([
        axios.get(`${API_URL}/homework/student/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/homework-results/dashboard/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (homeworkRes.data && homeworkRes.data.success) {
        const hwData = homeworkRes.data.data || homeworkRes.data;
        if (Array.isArray(hwData)) {
          setActiveHomeworks(hwData);
        } else if (hwData.activeAssignments) {
          setActiveHomeworks(hwData.activeAssignments);
        } else if (hwData.homeworks) {
          setActiveHomeworks(hwData.homeworks);
        }
      }

      if (resultRes.data && resultRes.data.success) {
        const resData = resultRes.data.data || resultRes.data;
        if (Array.isArray(resData)) {
          setGradedHomeworks(resData);
        } else if (resData.historyAndResults) {
          setGradedHomeworks(resData.historyAndResults);
        } else if (resData.results) {
          setGradedHomeworks(resData.results);
        }
      }
    } catch (err) {
      console.error("Error fetching homework dashboard:", err);
      setError(
        "Failed to load homework or grades. Please verify your connection or backend routes.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-indigo-600" size={36} />
        <p className="text-slate-500 text-sm font-bold">
          Loading student assignments...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="ltr">
      <div className="flex flex-wrap justify-between items-center border-b border-slate-100 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Homework & Assignments
            </h2>
            <p className="text-slate-400 text-xs font-bold mt-0.5">
              Review current homework tasks, strict deadlines, and teacher
              grades.
            </p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          <button
            onClick={() => setActiveTab("active")}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === "active"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Pending / Active ({activeHomeworks.length})
          </button>
          <button
            onClick={() => setActiveTab("graded")}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === "graded"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Graded History ({gradedHomeworks.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-sm font-bold flex items-center gap-2">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {activeTab === "active" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeHomeworks.length > 0 ? (
            activeHomeworks.map((hw) => {
              const dueDateFormatted = new Date(hw.dueDate).toLocaleDateString(
                "en-US",
                {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                },
              );

              return (
                <div
                  key={hw._id}
                  className="bg-slate-50/60 border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:border-indigo-100 hover:bg-white transition-all flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1">
                        <BookOpen size={10} /> {hw.subject?.name || "Subject"}
                      </span>
                      <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1 animate-pulse">
                        <Clock size={10} /> Pending Evaluation
                      </span>
                    </div>

                    <h3 className="text-base font-black text-slate-800 mb-1">
                      {hw.title}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold">
                      Page Number:{" "}
                      <span className="text-slate-700">
                        {hw.pageNumber || "N/A"}
                      </span>
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex justify-between items-center text-[11px] font-bold text-slate-500">
                    <span className="flex items-center gap-1 text-rose-500">
                      <Calendar size={12} /> Due: {dueDateFormatted}
                    </span>
                    <span className="text-slate-400">
                      Total Marks: {hw.totalMarks} pts
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
              <CheckCircle size={48} className="text-emerald-400" />
              <span className="text-sm font-bold text-slate-400">
                Hooray! No pending homework assignments.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gradedHomeworks.length > 0 ? (
            gradedHomeworks.map((item) => {
              const hw = item.homeworkDetails || item.homework;
              const res = item.result || item;

              return (
                <div
                  key={res._id || item._id}
                  className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 relative overflow-hidden"
                >
                  <div
                    className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                      res.status === "missing"
                        ? "bg-rose-500"
                        : "bg-emerald-500"
                    }`}
                  />

                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3 pl-2">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1">
                        <BookOpen size={10} /> {hw?.subject?.name || "Subject"}
                      </span>

                      {res.status === "missing" ? (
                        <span className="px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1">
                          <AlertCircle size={10} /> Missing / Not Submitted
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-1">
                          <CheckCircle size={10} /> Graded
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-black text-slate-800 mb-1 pl-2">
                      {hw?.title || "Homework Assignment"}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold pl-2">
                      Teacher:{" "}
                      <span className="text-slate-600">
                        {hw?.teacher
                          ? `${hw.teacher.firstName} ${hw.teacher.lastName}`
                          : "Instructor"}
                      </span>
                    </p>

                    {res.teacherFeedback && (
                      <div className="mt-3 mx-2 p-3 bg-slate-50 rounded-xl border border-slate-100 flex gap-2 items-start text-xs text-slate-600">
                        <MessageSquare
                          size={14}
                          className="text-indigo-500 mt-0.5 shrink-0"
                        />
                        <p className="italic font-medium">
                          "{res.teacherFeedback}"
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-4 pl-2 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold">
                      Corrected by system
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Award
                        size={16}
                        className={
                          res.status === "missing"
                            ? "text-rose-500"
                            : "text-emerald-500"
                        }
                      />
                      <span className="text-sm font-black text-slate-800">
                        Score:{" "}
                        <span
                          className={
                            res.status === "missing"
                              ? "text-rose-600"
                              : "text-emerald-600"
                          }
                        >
                          {res.score ?? 0}
                        </span>{" "}
                        / {hw?.totalMarks || res.homework?.totalMarks || 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
              <FileText size={48} />
              <span className="text-sm font-bold">
                No graded homework archive found.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Homework;
