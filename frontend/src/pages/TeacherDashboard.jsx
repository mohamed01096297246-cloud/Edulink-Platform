import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import axios from "axios";
import {
  LogOut,
  Users,
  Award,
  MessageCircle,
  BookOpen,
  LayoutDashboard,
  CalendarDays,
  Search,
  Bookmark,
} from "lucide-react";

import TeacherAttendance from "../components/Teacher/TeacherAttendance";
import TeacherGrades from "../components/Teacher/TeacherGrades";
import TeacherBehavior from "../components/Teacher/TeacherBehavior";
import TeacherHomework from "../components/Teacher/TeacherHomework";
import TeacherExamGrades from "../components/Teacher/TeacherExamGrades";
import { API_URL } from "../api/axios";

const TeacherDashboard = ({ onLogout }) => {
  const [allSchedules, setAllSchedules] = useState([]);
  const [filteredSchedules, setFilteredSchedules] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [teachingGrades, setTeachingGrades] = useState([]);
  const [teacherData, setTeacherData] = useState({ firstName: "Teacher" });

  const location = useLocation();
  const daysList = ["sat", "sun", "mon", "tue", "wed", "thu"];

  useEffect(() => {
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
    if (userInfo.firstName) {
      setTeacherData(userInfo);
      if (userInfo.teachingGrades && userInfo.teachingGrades.length > 0) {
        setTeachingGrades(userInfo.teachingGrades);
      } else {
        fetchTeachingGrades();
      }
    }
    const today = daysList[new Date().getDay()] || "sun";
    setSelectedDay(today);
    fetchSchedules(today);
  }, []);

  const fetchTeachingGrades = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API_URL}/grades`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeachingGrades(res.data.data);
    } catch (err) {
      console.error("Error fetching grades:", err);
    }
  };

  const fetchSchedules = async (day) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/teacher/dashboard`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setAllSchedules(res.data.allSchedules);
      setFilteredSchedules(res.data.allSchedules.filter((s) => s.day === day));
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    }
  };

  const handleDayChange = (e) => {
    const day = e.target.value;
    setSelectedDay(day);
    setFilteredSchedules(allSchedules.filter((s) => s.day === day));
    setSelectedScheduleId("");
    setSelectedClassId("");
    setStudents([]);
  };

  const handleClassChange = async (e) => {
    const scheduleId = e.target.value;
    setSelectedScheduleId(scheduleId);
    const selectedOption = e.target.options[e.target.selectedIndex];
    const classId = selectedOption.getAttribute("data-classid");
    setSelectedClassId(classId);

    if (!classId) {
      setStudents([]);
      return;
    }

    try {
      setLoadingStudents(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/teacher/dashboard?classroomId=${classId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setStudents(res.data.currentClassStudents);
    } catch (err) {
      console.error("Error loading students:", err);
    } finally {
      setLoadingStudents(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans" dir="ltr">
      {/* Sidebar Component */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="p-8 flex-1 flex flex-col justify-between">
          <div>
            {/* Header Title Sidebar */}
            <div className="flex items-center gap-3 mb-10">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-100">
                <Bookmark className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tighter">
                  Teacher Hub
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Academic Portal
                </p>
              </div>
            </div>

            {/* Navigation items */}
            <nav className="space-y-2">
              <MenuLink
                to="/teacher"
                icon={<LayoutDashboard size={20} />}
                label="Overview"
                active={location.pathname === "/teacher"}
              />
              <MenuLink
                to="/teacher/attendance"
                icon={<Users size={20} />}
                label="Attendance"
                active={location.pathname === "/teacher/attendance"}
              />
              <MenuLink
                to="/teacher/behavior"
                icon={<MessageCircle size={20} />}
                label="Behavior"
                active={location.pathname === "/teacher/behavior"}
              />
              <MenuLink
                to="/teacher/homework"
                icon={<BookOpen size={20} />}
                label="Homework"
                active={location.pathname === "/teacher/homework"}
              />
              <MenuLink
                to="/teacher/grades"
                icon={<Award size={20} />}
                label="Homework Grades"
                active={location.pathname === "/teacher/grades"}
              />
              <MenuLink
                to="/teacher/exam-grades"
                icon={<Award size={20} />}
                label="Exam Grades"
                active={location.pathname === "/teacher/exam-grades"}
              />
            </nav>
          </div>

          {/* Logout Button */}
          <div className="pt-6 border-t border-slate-100">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl transition-all font-black text-sm border border-rose-100 shadow-sm shadow-rose-50"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content View */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Navbar / Header Controller */}
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 context-header z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-black border border-blue-100">
              {teacherData.firstName
                ? teacherData.firstName.charAt(0).toUpperCase()
                : "T"}
            </div>
            <div>
              <p className="text-slate-800 font-black text-sm">
                Welcome back, Mr. {teacherData.firstName}
              </p>
              <p className="text-[11px] text-slate-400 font-bold">
                Manage your active classes and submissions
              </p>
            </div>
          </div>

          {/* Dropdown Filters Selector */}
          <div className="flex items-center gap-3">
            {/* Day Selector */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <CalendarDays size={16} className="text-slate-400 mr-2" />
              <select
                value={selectedDay}
                onChange={handleDayChange}
                className="bg-transparent text-xs font-bold border-none outline-none cursor-pointer pr-4 text-slate-700"
              >
                {daysList.map((d) => (
                  <option key={d} value={d} className="text-slate-800">
                    {d.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Session Selector */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search size={16} className="text-slate-400 mr-2" />
              <select
                value={selectedScheduleId}
                onChange={handleClassChange}
                className="bg-transparent text-xs font-bold border-none outline-none cursor-pointer pr-4 max-w-[180px] text-slate-700"
              >
                <option value="">Select Session</option>
                {filteredSchedules.map((s) => (
                  <option
                    key={s._id}
                    value={s._id}
                    data-classid={s.classroom._id}
                    className="text-slate-800"
                  >
                    {s.startTime} - {s.classroom.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* Nested Content Routes View */}
        <div className="p-8 flex-1">
          <Routes>
            <Route
              index
              element={
                <WelcomeView
                  teacherName={teacherData.firstName}
                  students={students}
                  loading={loadingStudents}
                  classSelected={!!selectedClassId}
                />
              }
            />
            <Route
              path="attendance"
              element={
                <TeacherAttendance
                  students={students}
                  loading={loadingStudents}
                  classroomId={selectedScheduleId}
                />
              }
            />
            <Route
              path="grades"
              element={
                <TeacherGrades
                  students={students}
                  loading={loadingStudents}
                  classroomId={selectedClassId}
                  teachingGrades={teachingGrades}
                />
              }
            />
            <Route
              path="behavior"
              element={
                <TeacherBehavior
                  students={students}
                  loading={loadingStudents}
                  classroomId={selectedScheduleId}
                />
              }
            />
            <Route
              path="homework"
              element={
                <TeacherHomework
                  grades={teachingGrades}
                  loading={loadingStudents}
                  classroomId={selectedClassId}
                />
              }
            />
            <Route
              path="exam-grades"
              element={
                <TeacherExamGrades
                  grades={teachingGrades}
                  loading={loadingStudents}
                  classroomId={selectedClassId}
                />
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
};

/* Styled Navigation MenuLink Component matching Admin Layout */
const MenuLink = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all ${
      active
        ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
        : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
    }`}
  >
    {icon}
    <span>{label}</span>
  </Link>
);

const WelcomeView = ({ teacherName, students, loading, classSelected }) => (
  <div className="flex flex-col items-center justify-center h-full text-center text-slate-600 space-y-2 px-4 max-w-lg mx-auto border border-slate-200 rounded-2xl bg-white shadow-sm shadow-slate-100 py-20">
    <h3 className="text-xl font-black text-slate-800 mb-2">
      Welcome to your Dashboard, Mr. {teacherName}
    </h3>
    <p className="text-slate-500 text-sm font-medium">
      Please select a session from the top filters to unlock active student
      evaluation logs.
    </p>
  </div>
);

export default TeacherDashboard;
