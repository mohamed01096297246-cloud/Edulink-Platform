import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Loader2,
  AlertCircle,
  BookOpen,
} from "lucide-react";

function Attendance({ attendanceData, studentId }) {
  const [attendance, setAttendance] = useState([]);
  const [subjectsMap, setSubjectsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api";

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await fetchSubjectsMap();

      if (attendanceData && Array.isArray(attendanceData)) {
        setAttendance(attendanceData);
        setLoading(false);
      } else if (studentId) {
        await fetchAttendanceRecords();
      } else {
        setLoading(false);
      }
    };

    initializeData();
  }, [attendanceData, studentId]);

  const fetchSubjectsMap = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/subjects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const subjectsList = res.data?.data || res.data || [];
      const subMap = {};
      subjectsList.forEach((sub) => {
        subMap[sub._id] = sub.name;
      });
      setSubjectsMap(subMap);
    } catch (err) {
      console.error("Error building subjects lookup map:", err);
    }
  };

  const fetchAttendanceRecords = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setError("");
      const res = await axios.get(
        `${API_URL}/attendance/student/${studentId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.data && res.data.success) {
        setAttendance(res.data.data || []);
      }
    } catch (err) {
      console.error("Error fetching attendance:", err);
      setError("Failed to load attendance records.");
    } finally {
      setLoading(false);
    }
  };

  const stats = attendance.reduce(
    (acc, record) => {
      if (record.status === "present") acc.present += 1;
      else if (record.status === "absent") acc.absent += 1;
      else if (record.status === "late") acc.late += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0 },
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-indigo-600" size={36} />
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="ltr">
      {/* Header */}
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-xl font-black text-slate-800">
          Attendance & Absence Tracker
        </h2>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-900 font-bold text-sm">
          <AlertCircle size={18} className="text-rose-500" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          icon={<CheckCircle size={24} />}
          type="present"
          label="Present"
          value={stats.present}
        />
        <StatCard
          icon={<XCircle size={24} />}
          type="absent"
          label="Absent"
          value={stats.absent}
        />
        <StatCard
          icon={<Clock size={24} />}
          type="late"
          label="Late"
          value={stats.late}
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {attendance.length === 0 ? (
          <div className="text-center py-12 text-slate-400 font-bold text-sm">
            No attendance records found for this student.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-wider border-b border-slate-100">
                <th className="py-4 px-6">Date</th>
                <th className="py-4 px-6">Subject</th>
                <th className="py-4 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm font-medium text-slate-600">
              {attendance.map((record) => {
                const subjectName =
                  record.subject?.name ||
                  record.schedule?.subject?.name ||
                  subjectsMap[record.subject] ||
                  "General Session";

                return (
                  <tr key={record._id} className="hover:bg-slate-50/50">
                    <td className="py-4 px-6 font-bold text-slate-800">
                      {new Date(record.date).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 flex items-center gap-2">
                      <BookOpen size={14} className="text-indigo-500" />
                      {subjectName}
                    </td>
                    <td className="py-4 px-6">
                      <StatusBadge status={record.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const StatCard = ({ icon, type, label, value }) => {
  const colorStyles = {
    present: {
      card: "bg-emerald-50/50 border-emerald-100",
      iconWrapper: "bg-emerald-50 text-emerald-600",
      label: "text-emerald-600",
    },
    absent: {
      card: "bg-rose-50/50 border-rose-100",
      iconWrapper: "bg-rose-50 text-rose-600",
      label: "text-rose-600",
    },
    late: {
      card: "bg-amber-50/50 border-amber-100",
      iconWrapper: "bg-amber-50 text-amber-600",
      label: "text-amber-600",
    },
  };

  const currentStyle = colorStyles[type] || colorStyles.present;

  return (
    <div className={`border rounded-3xl p-5 flex items-center gap-4 ${currentStyle.card}`}>
      <div className={`p-3 rounded-2xl ${currentStyle.iconWrapper}`}>
        {icon}
      </div>
      <div>
        <span className={`text-xs font-bold uppercase ${currentStyle.label}`}>
          {label}
        </span>
        <span className="text-2xl font-black text-slate-800 block">{value}</span>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    present: "bg-emerald-50 text-emerald-600",
    absent: "bg-rose-50 text-rose-600",
    late: "bg-amber-50 text-amber-600",
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-bold ${styles[status] || "bg-slate-100"}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default Attendance;