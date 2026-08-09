import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BookOpen,
  Send,
  CheckCircle,
  AlertTriangle,
  User,
  ChevronRight,
  ClipboardCheck,
  Loader2,
} from "lucide-react";

const TeacherGrades = ({ teachingGrades, classroomId }) => {
  const [selectedGrade, setSelectedGrade] = useState("");
  const [homeworks, setHomeworks] = useState([]);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [gradingList, setGradingList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    if (selectedGrade) {
      const fetchHomeworks = async () => {
        try {
          const token = localStorage.getItem("token");
          const res = await axios.get(
            `http://localhost:5000/api/homework?gradeId=${selectedGrade}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          setHomeworks(res.data.data || []);
        } catch (err) {
          console.error("Error fetching homeworks");
          setHomeworks([]);
        }
      };
      fetchHomeworks();
    } else {
      setHomeworks([]);
      setSelectedHomework(null);
    }
  }, [selectedGrade]);


  const handleSelectHomework = async (hw) => {
    setSelectedHomework(hw);
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `http://localhost:5000/api/teacher/dashboard?classroomId=${hw.classroom._id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const studentsData = res.data.currentClassStudents || [];

      const initialGrades = studentsData.map((student) => ({
        studentId: student._id,
        name: `${student.firstName} ${student.lastName}`,
        status: "submitted",
        score: 0,
        teacherFeedback: "",
      }));
      setGradingList(initialGrades);
    } catch (err) {
      setStatusMsg({ type: "error", text: "Failed to load students list" });
    } finally {
      setLoading(false);
    }
  };

  const updateGradeEntry = (id, field, value) => {
    setGradingList((prev) =>
      prev.map((item) => {
        if (item.studentId === id) {
          const updated = { ...item, [field]: value };
          if (field === "status" && value === "missing") {
            updated.score = 0;
          }
          return updated;
        }
        return item;
      }),
    );
  };

  const handleSubmitGrades = async () => {
    setSubmitting(true);
    setStatusMsg({ type: "", text: "" });

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `http://localhost:5000/api/homework-results/grade/${selectedHomework._id}`,
        { grades: gradingList },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.data.success) {
        setStatusMsg({ type: "success", text: res.data.message });
      }
    } catch (err) {
      setStatusMsg({
        type: "error",
        text: err.response?.data?.message || "Error saving grades",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
          <label className="block text-sm font-black text-slate-500 mb-2 px-2 uppercase tracking-wider">
            Step 1: Select Grade
          </label>
          <select
            className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 focus:ring-2 ring-indigo-500 transition-all"
            onChange={(e) => setSelectedGrade(e.target.value)}
            value={selectedGrade}
          >
            <option value="">Choose Stage...</option>
            {Array.isArray(teachingGrades) &&
              teachingGrades.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
          </select>
        </div>

        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
          <label className="block text-sm font-black text-slate-500 mb-2 px-2 uppercase tracking-wider">
            Step 2: Select Homework
          </label>
          <select
            disabled={!selectedGrade}
            className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 focus:ring-2 ring-indigo-500 transition-all disabled:opacity-50"
            onChange={(e) => {
              const hw = homeworks.find((h) => h._id === e.target.value);
              if (hw) handleSelectHomework(hw);
            }}
          >
            <option value="">
              {selectedGrade ? "Select Assignment..." : "Select grade first"}
            </option>
            {homeworks.map((hw) => (
              <option key={hw._id} value={hw._id}>
                {hw.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {statusMsg.text && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 font-bold animate-pulse ${
            statusMsg.type === "success"
              ? "bg-emerald-50 text-emerald-600"
              : "bg-rose-50 text-rose-600"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle size={20} />
          ) : (
            <AlertTriangle size={20} />
          )}
          {statusMsg.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      ) : (
        selectedHomework && (
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  {selectedHomework.title}
                </h3>
                <p className="text-slate-400 font-bold text-sm">
                  Max Marks: {selectedHomework.totalMarks}
                </p>
              </div>
              <button
                onClick={handleSubmitGrades}
                disabled={submitting}
                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg disabled:bg-slate-300"
              >
                {submitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ClipboardCheck size={20} />
                )}
                Save All Grades
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-400 text-xs font-black uppercase tracking-widest">
                    <th className="p-6">Student</th>
                    <th className="p-6">Status</th>
                    <th className="p-6">Score</th>
                    <th className="p-6">Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {gradingList.map((entry) => (
                    <tr
                      key={entry.studentId}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-black">
                            {entry.name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-700">
                            {entry.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-6">
                        <select
                          value={entry.status}
                          onChange={(e) =>
                            updateGradeEntry(
                              entry.studentId,
                              "status",
                              e.target.value,
                            )
                          }
                          className={`p-2 rounded-xl text-xs font-black border-none ring-1 ring-slate-200 outline-none ${
                            entry.status === "missing"
                              ? "text-rose-500 bg-rose-50"
                              : entry.status === "late"
                                ? "text-amber-500 bg-amber-50"
                                : "text-emerald-500 bg-emerald-50"
                          }`}
                        >
                          <option value="submitted">Submitted</option>
                          <option value="late">Late</option>
                          <option value="missing">Missing</option>
                        </select>
                      </td>
                      <td className="p-6">
                        <input
                          type="number"
                          min="0"
                          max={selectedHomework.totalMarks}
                          disabled={entry.status === "missing"}
                          value={entry.score}
                          onChange={(e) =>
                            updateGradeEntry(
                              entry.studentId,
                              "score",
                              Number(e.target.value),
                            )
                          }
                          className="w-20 p-3 bg-slate-100 rounded-xl font-black text-center text-slate-700 border-none focus:ring-2 ring-indigo-500"
                        />
                      </td>
                      <td className="p-6">
                        <input
                          type="text"
                          placeholder="Feedback..."
                          value={entry.teacherFeedback}
                          onChange={(e) =>
                            updateGradeEntry(
                              entry.studentId,
                              "teacherFeedback",
                              e.target.value,
                            )
                          }
                          className="w-full p-3 bg-slate-50 rounded-xl text-sm font-medium border-none focus:ring-2 ring-indigo-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default TeacherGrades;
