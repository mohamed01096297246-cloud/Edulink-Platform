import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers,
  Inbox,
  Filter,
} from "lucide-react";
import { toast } from "react-hot-toast";

const Grades = ({ studentId, selectedChild }) => {

  const [allExams, setAllExams] = useState([]);
  const [subjectsMap, setSubjectsMap] = useState({}); 
  const [selectedType, setSelectedType] = useState("all"); 
  const [compiledGrades, setCompiledGrades] = useState([]);

  // Loading states
  const [loadingData, setLoadingData] = useState(false);

  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api";

  const examTypes = [
    { id: "all", label: "All Examinations" },
    { id: "midterm", label: "Midterm Exams" },
    { id: "final", label: "Final Exams" },
  ];

  useEffect(() => {
    if (studentId) {
      loadInitialConfiguration();
    }
  }, [studentId]);

  const loadInitialConfiguration = async () => {
    try {
      setLoadingData(true);
      setCompiledGrades([]);

      const subjectsRes = await axios.get(`${API_URL}/subjects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const subjectsList = subjectsRes.data?.data || subjectsRes.data || [];
      const subMap = {};
      subjectsList.forEach((sub) => {
        subMap[sub._id] = sub.name;
      });
      setSubjectsMap(subMap);

      const examsRes = await axios.get(
        `${API_URL}/exams/student/${studentId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const studentExams = examsRes.data.data || examsRes.data || [];
      setAllExams(studentExams);
    } catch (err) {
      console.error("Error configuration system keys:", err);
      toast.error(
        "Failed to load academic course and exam matrix configuration.",
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (studentId && allExams.length > 0) {
      fetchGradesBySelectedType();
    }
  }, [selectedType, allExams, studentId]);

  const fetchGradesBySelectedType = async () => {
    try {
      setLoadingData(true);

      const filteredExams = allExams.filter((exam) => {
        const title = (exam.title || "").toLowerCase();
        if (selectedType === "midterm") {
          return (
            title.includes("نصف") ||
            title.includes("ميد") ||
            title.includes("mid")
          );
        }
        if (selectedType === "final") {
          return (
            title.includes("نهائي") ||
            title.includes("فاينل") ||
            title.includes("final") ||
            title.includes("آخر")
          );
        }
        if (selectedType === "monthly") {
          return title.includes("شهر") || title.includes("month");
        }
        return true;
      });

      if (filteredExams.length === 0) {
        setCompiledGrades([]);
        return;
      }
      const requests = filteredExams.map((exam) =>
        axios
          .get(`${API_URL}/results/report/${studentId}/${exam._id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => null),
      );

      const responses = await Promise.all(requests);

      let aggregate = [];
      responses.forEach((res, index) => {
        if (res && res.data && res.data.success) {
          const report = res.data.data;
          const subjects = report.subjects || [];

          subjects.forEach((sub) => {
            aggregate.push({
              ...sub,
              examTitle: filteredExams[index].title,
              academicYear: filteredExams[index].academicYear,
            });
          });
        }
      });

      setCompiledGrades(aggregate);
    } catch (err) {
      console.error("Error aggregating typed reports:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const getCardPerformanceStyle = (grade) => {
    if (grade >= 85)
      return {
        border: "border-l-4 border-l-emerald-500",
        text: "text-emerald-600",
        bg: "bg-emerald-50",
        label: "Excellent 🌟",
      };
    if (grade >= 75)
      return {
        border: "border-l-4 border-l-blue-500",
        text: "text-blue-600",
        bg: "bg-blue-50",
        label: "Very Good 👍",
      };
    if (grade >= 50)
      return {
        border: "border-l-4 border-l-amber-500",
        text: "text-amber-600",
        bg: "bg-amber-50",
        label: "Good 📝",
      };
    return {
      border: "border-l-4 border-l-rose-500",
      text: "text-rose-600",
      bg: "bg-rose-50",
      label: "Needs Improvement ⚠️",
    };
  };

  if (!studentId) {
    return (
      <div
        className="max-w-4xl mx-auto py-16 px-8 bg-white rounded-[3rem] border border-slate-100 flex flex-col items-center justify-center text-slate-300 gap-3 text-center"
        dir="ltr"
      >
        <Inbox size={44} />
        <span className="text-sm font-black text-slate-700 mt-1">
          No Profile Is Currently Active
        </span>
        <p className="text-xs text-slate-400 font-bold max-w-xs">
          Please select a student profile from the main header panel to load
          registered exam reports.
        </p>
      </div>
    );
  }

  return (
    <div
      className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500"
      dir="ltr"
    >
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <Award size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Academic Performance Ledger:{" "}
              <span className="text-indigo-600">
                {selectedChild?.studentInfo?.fullName || "Student"}
              </span>
            </h2>
            <p className="text-slate-400 text-xs font-bold mt-0.5 tracking-wide">
              Official graded transcripts extracted directly from central
              educational databases
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-2">
          <Filter size={16} />
          <span className="text-xs font-black uppercase tracking-wider">
            Filter Reports By Examination Category
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start pt-1">
          {examTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                selectedType === type.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {loadingData ? (
        <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="animate-spin text-indigo-500" size={32} />
          <span className="text-xs font-bold">
            Parsing authorized archive scoreboards...
          </span>
        </div>
      ) : compiledGrades.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-400 px-2">
            <Layers size={14} />
            <span className="text-xs font-black">
              Documented Academic Assessments ({compiledGrades.length} Modules
              Found):
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {compiledGrades.map((item, index) => {
              const gradeValue = item.grade ?? 0;
              const style = getCardPerformanceStyle(gradeValue);

              const subjectName =
                item.subject?.name ||
                item.subjectName ||
                subjectsMap[item.subject] ||
                "Academic Course";

              return (
                <div
                  key={index}
                  className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 relative overflow-hidden ${style.border}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md max-w-[180px] truncate">
                        {item.examTitle || "Term Assessment"}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                      <h3 className="text-sm font-black text-slate-800 tracking-tight">
                        {subjectName}
                      </h3>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-50 flex items-end justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-slate-400">
                        Acquired Score
                      </p>
                      <p className="text-base font-mono font-black text-slate-800">
                        <span className="text-indigo-600 text-lg font-black">
                          {gradeValue}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">
                          {" "}
                          / 100
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {gradeValue >= 50 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-lg font-black">
                          <CheckCircle2 size={12} /> Good
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-600 px-2.5 py-1 rounded-lg font-black">
                          <AlertTriangle size={12} /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white py-16 px-8 rounded-[3rem] border border-slate-100 flex flex-col items-center justify-center text-slate-300 gap-3 text-center">
          <Award size={48} className="text-slate-200" />
          <span className="text-sm font-black text-slate-600 mt-2">
            No Verified Metrics Available
          </span>
          <p className="text-xs text-slate-400 font-bold max-w-xs leading-relaxed">
            There are currently no documented examination marks registered in
            the database matching this specific assessment category selection.
          </p>
        </div>
      )}
    </div>
  );
};

export default Grades;
