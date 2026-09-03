import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  CheckCircle,
  XCircle,
  Clock,
  Save,
  AlertCircle,
  Loader2,
  Calendar,
  Lock,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { API_URL } from "../../api/axios";

const TeacherAttendance = ({ students, loading, classroomId }) => {
  const [attendanceData, setAttendanceData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPastAttendance, setFetchingPastAttendance] = useState(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [errorAlert, setErrorAlert] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );

  useEffect(() => {
    const fetchExistingOrSetDefault = async () => {
      if (!classroomId || !students || students.length === 0) {
        setAttendanceData({});
        return;
      }

      setErrorAlert("");
      setIsUpdateMode(false);

      try {
        setFetchingPastAttendance(true);
        const token = localStorage.getItem("token");

        const res = await axios.get(
          `${API_URL}/attendance/check/${classroomId}`,
          {
            params: {
              classroomId: classroomId,
              date: selectedDate,
            },
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (res.data && res.data.exists && res.data.records.length > 0) {
          const savedAttendance = {};
          res.data.records.forEach((record) => {
            const studentId = record.student?._id || record.student;
            savedAttendance[studentId] = record.status;
          });
          setAttendanceData(savedAttendance);
          setIsUpdateMode(true);
          setErrorAlert(
            "Notice: Attendance for this session has already been recorded today.",
          );
        } else {
          setDefaultAttendance();
        }
      } catch (err) {
        console.error("Error fetching past attendance:", err);
        setDefaultAttendance();
      } finally {
        setFetchingPastAttendance(false);
      }
    };

    const setDefaultAttendance = () => {
      const initialAttendance = {};
      students.forEach((student) => {
        initialAttendance[student._id] = "present";
      });
      setAttendanceData(initialAttendance);
    };

    fetchExistingOrSetDefault();
  }, [students, classroomId, selectedDate]);

  const handleStatusChange = (studentId, status) => {
    if (isUpdateMode) {
      return toast.error(
        "Existing records cannot be modified from this sheet.",
      );
    }
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  const handleSubmit = async () => {
    if (!classroomId) return toast.error("Please select a session first!");

    const records = Object.entries(attendanceData).map(
      ([studentId, status]) => ({
        student: studentId,
        status: status,
      }),
    );

    try {
      setSubmitting(true);
      const token = localStorage.getItem("token");

      const response = await axios.post(
        `${API_URL}/attendance/bulk`,
        {
          scheduleId: classroomId,
          records,
          selectedDate,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        toast.success("Attendance recorded successfully!");
        setIsUpdateMode(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save attendance.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!classroomId) {
    return (
      <div
        className="bg-amber-50 border border-amber-200 p-10 rounded-[2rem] text-center"
        dir="ltr"
      >
        <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
        <h3 className="text-xl font-black text-amber-900">
          No Session Selected Yet
        </h3>
        <p className="text-amber-700 font-medium">
          Please select a classroom session from the top menu dropdown to load
          the attendance sheet.
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
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-left">
            <h2 className="text-2xl font-black text-slate-800">
              Attendance Sheet
            </h2>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">
              Total Students in Class: {students.length}
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
            <Calendar size={18} className="text-indigo-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-bold text-slate-600 outline-none cursor-pointer text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || students.length === 0 || isUpdateMode}
          className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all shadow-lg disabled:opacity-50 ${
            isUpdateMode
              ? "bg-slate-400 text-white cursor-not-allowed shadow-none"
              : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200"
          }`}
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : isUpdateMode ? (
            <Lock size={18} />
          ) : (
            <Save size={18} />
          )}
          {isUpdateMode ? "Saved & Locked" : "Save Attendance"}
        </button>
      </div>

      {errorAlert && (
        <div
          className={`flex items-center gap-3 border p-5 rounded-[1.5rem] animate-in fade-in slide-in-from-top-2 duration-500 ${isUpdateMode ? "bg-emerald-50 border-emerald-100 text-emerald-900" : "bg-rose-50 border-rose-100 text-rose-900"}`}
        >
          <div
            className={`p-2 rounded-xl ${isUpdateMode ? "bg-emerald-100" : "bg-rose-100"}`}
          >
            <AlertCircle
              size={20}
              className={isUpdateMode ? "text-emerald-600" : "text-rose-600"}
            />
          </div>
          <span className="font-bold text-sm leading-relaxed">
            {errorAlert}
          </span>
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest">
                <th className="px-8 py-5">Student Information</th>
                <th className="px-8 py-5 text-center">Status Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((student) => (
                <tr
                  key={student._id}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center font-black">
                        {student.firstName ? student.firstName[0] : "S"}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800">
                          {student.firstName} {student.lastName}
                        </h4>
                        <p className="text-xs text-slate-400 font-bold tracking-tight uppercase">
                          ID: {student._id.slice(-6)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div
                      className={`flex items-center justify-center gap-2 max-w-[400px] mx-auto bg-slate-100/50 p-1.5 rounded-2xl ${isUpdateMode ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <StatusButton
                        active={attendanceData[student._id] === "present"}
                        onClick={() =>
                          handleStatusChange(student._id, "present")
                        }
                        icon={<CheckCircle size={16} />}
                        color="green"
                        label="Present"
                      />
                      <StatusButton
                        active={attendanceData[student._id] === "absent"}
                        onClick={() =>
                          handleStatusChange(student._id, "absent")
                        }
                        icon={<XCircle size={16} />}
                        color="red"
                        label="Absent"
                      />
                      <StatusButton
                        active={attendanceData[student._id] === "late"}
                        onClick={() => handleStatusChange(student._id, "late")}
                        icon={<Clock size={16} />}
                        color="amber"
                        label="Late"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatusButton = ({ active, onClick, icon, color, label }) => {
  const colors = {
    green: active
      ? "bg-emerald-500 text-white shadow-md shadow-emerald-100"
      : "text-emerald-500 hover:bg-emerald-50 bg-white",
    red: active
      ? "bg-rose-500 text-white shadow-md shadow-rose-100"
      : "text-rose-500 hover:bg-rose-50 bg-white",
    amber: active
      ? "bg-amber-500 text-white shadow-md shadow-amber-100"
      : "text-amber-500 hover:bg-amber-50 bg-white",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 py-2 px-4 rounded-xl text-[12px] font-black transition-all duration-300 ${colors[color]}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

export default TeacherAttendance;
