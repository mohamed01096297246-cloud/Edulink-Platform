import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Send,
  MessageSquare,
  Loader2,
  AlertCircle,
  Calendar,
  Lock,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { API_URL } from "../../api/axios";

const TeacherBehavior = ({ students, loading, classroomId }) => {
  const [behaviorEntries, setBehaviorEntries] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPastBehavior, setFetchingPastBehavior] = useState(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [errorAlert, setErrorAlert] = useState("");

  const [selectedDate, setSelectedDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );

  useEffect(() => {
    const fetchExistingBehavior = async () => {
      if (!classroomId || !students || students.length === 0) {
        setBehaviorEntries({});
        return;
      }

      setErrorAlert("");
      setIsUpdateMode(false);

      try {
        setFetchingPastBehavior(true);
        const token = localStorage.getItem("token");
        const res = await axios.get(
          `${API_URL}/behavior/check?classroomId=${classroomId}&date=${selectedDate}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.data && res.data.exists && res.data.records.length > 0) {
          const savedBehavior = {};
          res.data.records.forEach((record) => {
            const studentId = record.student?._id || record.student;
            savedBehavior[studentId] = {
              type: record.type,
              note: record.note,
            };
          });
          setBehaviorEntries(savedBehavior);
          setIsUpdateMode(true);
          setErrorAlert(
            "Notice: Behavior reports for this specific session have already been logged today.",
          );
        } else {
          setBehaviorEntries({});
        }
      } catch (err) {
        console.error("Error fetching past behavior:", err);
        setBehaviorEntries({});
      } finally {
        setFetchingPastBehavior(false);
      }
    };

    fetchExistingBehavior();
  }, [students, classroomId, selectedDate]);

  const updateEntry = (studentId, field, value) => {
    if (isUpdateMode) return;

    setBehaviorEntries((prev) => {
      const currentStudentData = prev[studentId] || {};
      if (field === "type" && currentStudentData.type === value) {
        return {
          ...prev,
          [studentId]: {
            ...currentStudentData,
            type: undefined,
          },
        };
      }

      return {
        ...prev,
        [studentId]: {
          ...currentStudentData,
          [field]: value,
        },
      };
    });
  };
  const handleSubmit = async () => {
    if (!classroomId) return toast.error("Please select a session first!");

    const behaviorRecords = Object.entries(behaviorEntries)
      .filter(([_, data]) => data.type && data.note?.trim())
      .map(([studentId, data]) => ({
        studentId,
        type: data.type,
        note: data.note.trim(),
      }));

    if (behaviorRecords.length === 0) {
      return toast.error(
        "Please provide evaluation data for at least one student.",
      );
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API_URL}/behavior/bulk`,
        {
          scheduleId: classroomId,
          behaviorRecords,
          selectedDate,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        toast.success("Behavior metrics submitted successfully!");
        setIsUpdateMode(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to record behavior.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || fetchingPastBehavior) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin mb-4 text-indigo-600" size={40} />
        <p className="font-bold tracking-tight">
          Fetching Student Records & Evaluations...
        </p>
      </div>
    );
  }

  if (!classroomId) {
    return (
      <div
        className="bg-indigo-50 border border-indigo-100 p-10 rounded-[2.5rem] text-center"
        dir="ltr"
      >
        <AlertCircle className="mx-auto text-indigo-500 mb-4" size={48} />
        <h3 className="text-xl font-black text-indigo-900">
          Session Not Selected
        </h3>
        <p className="text-indigo-600 font-medium">
          Select a classroom schedule from the dashboard header to record
          behavior observations.
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700"
      dir="ltr"
    >
      <div className="flex flex-wrap gap-4 justify-between items-center bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              Behavior Tracking
            </h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">
              Record classroom observations and student conduct
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
            <Calendar size={18} className="text-indigo-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-bold text-slate-600 outline-none cursor-pointer"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || students.length === 0 || isUpdateMode}
          className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all shadow-lg disabled:opacity-50 ${
            isUpdateMode
              ? "bg-slate-400 text-white cursor-not-allowed shadow-none"
              : "bg-slate-900 text-white hover:bg-black shadow-slate-200"
          }`}
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : isUpdateMode ? (
            <Lock size={18} />
          ) : (
            <Send size={18} />
          )}
          {isUpdateMode ? "Saved & Locked" : "Submit Reports"}
        </button>
      </div>

      {errorAlert && (
        <div className="flex items-center gap-3 border border-emerald-100 bg-emerald-50 text-emerald-900 p-5 rounded-[1.5rem] animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="p-2 rounded-xl bg-emerald-100">
            <AlertCircle size={20} className="text-emerald-600" />
          </div>
          <span className="font-bold text-sm leading-relaxed">
            {errorAlert}
          </span>
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
              <th className="px-8 py-5">Student</th>
              <th className="px-8 py-5">Behavior Type</th>
              <th className="px-8 py-5">Notes / Observations (Mandatory)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {students.map((student) => (
              <tr
                key={student._id}
                className="hover:bg-slate-50/30 transition-colors"
              >
                <td className="px-8 py-4 w-1/4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-bold">
                      {student.firstName ? student.firstName[0] : "S"}
                    </div>
                    <div>
                      <span className="font-bold text-slate-700 whitespace-nowrap block">
                        {student.firstName} {student.lastName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold block">
                        ID: {student._id.slice(-6)}
                      </span>
                    </div>
                  </div>
                </td>

                <td className="px-8 py-4 w-1/4">
                  <div
                    className={`flex gap-2 ${isUpdateMode ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateEntry(student._id, "type", "positive")
                      }
                      className={`px-4 py-2 text-xs rounded-xl font-black transition-all ${
                        behaviorEntries[student._id]?.type === "positive"
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-100"
                          : "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-500"
                      }`}
                    >
                      Positive
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateEntry(student._id, "type", "negative")
                      }
                      className={`px-4 py-2 text-xs rounded-xl font-black transition-all ${
                        behaviorEntries[student._id]?.type === "negative"
                          ? "bg-rose-500 text-white shadow-md shadow-rose-100"
                          : "bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                      }`}
                    >
                      Negative
                    </button>
                  </div>
                </td>

                <td className="px-8 py-4">
                  <div className="relative flex items-center">
                    <MessageSquare
                      className="absolute left-3 text-slate-300"
                      size={16}
                    />
                    <input
                      type="text"
                      disabled={isUpdateMode}
                      placeholder={
                        isUpdateMode
                          ? "Submission finalized"
                          : "Enter a brief specific note..."
                      }
                      value={behaviorEntries[student._id]?.note || ""}
                      onChange={(e) =>
                        updateEntry(student._id, "note", e.target.value)
                      }
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeacherBehavior;
