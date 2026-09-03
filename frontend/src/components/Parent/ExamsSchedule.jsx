import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Calendar,
  Clock,
  BookOpen,
  FileText,
  Loader2,
  AlertCircle,
  Filter,
  Tag,
} from "lucide-react";
import { API_URL } from "../../api/axios";

function ExamsSchedule({ studentId }) {
  const [exams, setExams] = useState([]);
  const [filteredExams, setFilteredExams] = useState([]);
  const [selectedType, setSelectedType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (studentId) {
      fetchExamSchedules();
    }
  }, [studentId]);

  useEffect(() => {
    if (selectedType === "all") {
      setFilteredExams(exams);
    } else {
      const filtered = exams.filter((exam) => exam.examType === selectedType);
      setFilteredExams(filtered);
    }
  }, [selectedType, exams]);

  const fetchExamSchedules = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await axios.get(`${API_URL}/exams/student/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const examData = res.data.data || [];
      setExams(examData);
      setFilteredExams(examData);
    } catch (err) {
      console.error("Error fetching exam schedule:", err);
      setError("Failed to load exam schedules. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return new Date(dateString).toLocaleDateString("en-US", options);
  };

  const renderExamTypeBadge = (type) => {
    switch (type) {
      case "midterm":
        return (
          <span className="px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1">
            <Tag size={12} /> Midterm Exam
          </span>
        );
      case "final":
        return (
          <span className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1">
            <Tag size={12} /> Final Exam
          </span>
        );
      default:
        return (
          <span className="px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1">
            <Tag size={12} /> Official Exam
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-indigo-600" size={36} />
        <p className="text-slate-500 text-sm font-bold">
          Loading exam schedules...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="ltr">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Official Exam Schedules
            </h2>
            <p className="text-slate-400 text-xs font-bold mt-0.5">
              Monitor your child's exam dates and categories for the current
              semester.
            </p>
          </div>
        </div>

        {/* 🎯 Filter Capsule Components */}
        <div className="flex items-center bg-slate-100 rounded-2xl px-4 py-2.5 border border-slate-200 shadow-sm gap-2 max-w-xs">
          <Filter size={16} className="text-slate-400" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-transparent text-slate-700 text-xs font-bold outline-none cursor-pointer w-full"
          >
            <option value="all">All Exams</option>
            <option value="midterm">Midterm Exams</option>
            <option value="final">Final Exams</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-sm font-bold flex items-center gap-2">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {filteredExams.length > 0 ? (
        <div className="space-y-10">
          {filteredExams.map((exam) => (
            <div
              key={exam._id}
              className="bg-slate-50 border border-slate-100 rounded-[2.5rem] p-6 shadow-sm"
            >
              {/* Exam Header */}
              <div className="flex flex-wrap justify-between items-center mb-6 gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">
                      {exam.title}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold mt-0.5">
                      Academic Year: {exam.academicYear}
                    </p>
                  </div>
                  {/* Badge Component */}
                  <div className="mt-1 sm:mt-0">
                    {renderExamTypeBadge(exam.examType)}
                  </div>
                </div>
                <span className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black">
                  Grade: {exam.grade?.name || "N/A"}
                </span>
              </div>

              {/* Timetable Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-xs font-black">
                      <th className="p-4">Subject</th>
                      <th className="p-4">Day & Date</th>
                      <th className="p-4">Start Time</th>
                      <th className="p-4">End Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 text-sm font-bold">
                    {exam.timetable && exam.timetable.length > 0 ? (
                      exam.timetable.map((slot, index) => (
                        <tr
                          key={slot._id || index}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          {/* Subject Name */}
                          <td className="p-4 flex items-center gap-2 text-slate-800 font-black">
                            <BookOpen size={16} className="text-indigo-500" />
                            {slot.subject?.name || "Subject"}
                          </td>
                          {/* Exam Date */}
                          <td className="p-4 text-slate-500 text-xs">
                            {formatDate(slot.date)}
                          </td>
                          {/* Start Time */}
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs font-black">
                              <Clock size={12} />
                              {slot.startTime}
                            </span>
                          </td>
                          {/* End Time */}
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-black">
                              <Clock size={12} />
                              {slot.endTime}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="4"
                          className="text-center py-6 text-slate-400 text-xs"
                        >
                          No subject details have been added to this schedule
                          yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
          <Calendar size={40} className="text-slate-300" />
          <span className="text-sm font-black">No exam schedules found</span>
          <span className="text-xs text-slate-300 font-normal">
            There are no schedules matching the selected criteria at this
            moment.
          </span>
        </div>
      )}
    </div>
  );
}

export default ExamsSchedule;
