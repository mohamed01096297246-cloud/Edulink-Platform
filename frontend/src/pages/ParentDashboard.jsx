import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import axios from "axios";
import { LogOut, Loader2, User } from "lucide-react";
import Sidebar from "../components/Parent/Sidebar";
import Homework from "../components/Parent/Homework";
import Attendance from "../components/Parent/Attendance";
import Behavior from "../components/Parent/Behavior";
import Grades from "../components/Parent/Grades";
import Schedules from "../components/Parent/Schedules";
import Notifications from "../components/Parent/Notifications";
import ExamsSchedule from "../components/Parent/ExamsSchedule";

function ParentDashboard({ handleLogout }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api";

  useEffect(() => {
    fetchMyChildren();
  }, []);

  const fetchMyChildren = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/parent/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const childrenData = res.data.children || [];
      setChildren(childrenData);

      if (childrenData.length > 0) {
        setSelectedChild(childrenData[0]);
      }
    } catch (err) {
      console.error("Error fetching children:", err);
    } finally {
      setLoading(false);
    }
  };

  const onLogoutClick = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userInfo");
    if (handleLogout) {
      handleLogout();
    }
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-slate-500 font-bold text-sm tracking-wide animate-pulse">
          Loading Parent Dashboard Environment...
        </p>
      </div>
    );
  }

  const currentStudentId = selectedChild?.studentInfo?.id || selectedChild?._id;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans" dir="ltr">
      {/* Sidebar Layout */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Dynamic Header Component */}
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tighter">
                Edu<span className="text-blue-600">School</span>
              </h1>
              <p className="text-slate-400 text-[11px] font-bold mt-0.5 flex items-center gap-1.5">
                <User size={13} className="text-blue-500" />
                Active Profile:{" "}
                <span className="text-slate-700 font-extrabold">
                  {selectedChild?.studentInfo?.fullName ||
                    "No Student Selected"}
                </span>
              </p>
            </div>

            {/* Child Selector Switcher */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <select
                value={currentStudentId || ""}
                onChange={(e) => {
                  const child = children.find(
                    (c) => (c.studentInfo?.id || c._id) === e.target.value,
                  );
                  if (child) setSelectedChild(child);
                }}
                className="bg-transparent text-slate-700 text-xs font-bold border-none outline-none cursor-pointer pr-4 focus:ring-0 p-0"
                disabled={children.length === 0}
              >
                {children.length > 0 ? (
                  children.map((child) => {
                    const id = child.studentInfo?.id || child._id;
                    return (
                      <option key={id} value={id}>
                        {child.studentInfo?.fullName} (
                        {child.studentInfo?.classroom || "General Class"})
                      </option>
                    );
                  })
                ) : (
                  <option value="">No children linked yet</option>
                )}
              </select>
            </div>
          </div>

          {/* Action Sign-Out Button */}
          <button
            onClick={onLogoutClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl transition-all font-black text-xs border border-rose-100 shadow-sm"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </header>

        {/* Workspace Card View */}
        <div className="p-8 flex-1">
          {/* تم تعديل الحواف هنا لتصبح مستقيمة من الأعلى rounded-t-none ودائرية من الأسفل فقط rounded-b-2xl */}
          <div className="bg-white border border-slate-200 rounded-t-none rounded-b-2xl p-6 shadow-sm min-h-[75vh]">
            {selectedChild ? (
              <Routes>
                <Route index element={<Navigate to="schedule" replace />} />

                <Route
                  path="homework"
                  element={<Homework studentId={currentStudentId} />}
                />

                <Route
                  path="attendance"
                  element={
                    <Attendance
                      attendanceData={selectedChild?.attendance}
                      studentId={currentStudentId}
                    />
                  }
                />

                <Route
                  path="behavior"
                  element={<Behavior studentId={currentStudentId} />}
                />

                <Route
                  path="grades"
                  element={
                    <Grades
                      studentId={currentStudentId}
                      selectedChild={selectedChild}
                    />
                  }
                />

                <Route
                  path="notifications"
                  element={<Notifications studentId={currentStudentId} />}
                />

                <Route
                  path="schedule"
                  element={
                    <Schedules
                      classroomId={
                        selectedChild.studentInfo?.classroomId ||
                        currentStudentId
                      }
                    />
                  }
                />

                <Route
                  path="exams"
                  element={<ExamsSchedule studentId={currentStudentId} />}
                />

                <Route path="*" element={<Navigate to="schedule" replace />} />
              </Routes>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-bold uppercase tracking-widest gap-2">
                <span>⚠️ No children linked to this account</span>
                <span className="text-xs text-slate-300 lowercase font-normal">
                  Please link students in the database admin panel
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default ParentDashboard;
