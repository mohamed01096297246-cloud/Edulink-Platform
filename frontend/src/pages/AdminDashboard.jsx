import React from "react";
import {
  Users,
  GraduationCap,
  Calendar,
  BellRing,
  LogOut,
  LayoutDashboard,
  Settings,
  BookOpen,
} from "lucide-react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Navigate } from "react-router-dom";

import TeacherManager from "../components/Admin/TeacherManager";
import StudentManager from "../components/Admin/StudentManager";
import ScheduleManager from "../components/Admin/ScheduleManager";
import ExamManagement from "../components/Admin/schedualExamManager";
import NotificationManager from "../components/Admin/NotificationManager";
import AdminManager from "../components/Admin/AdminManager";
import ClassroomManager from "../components/Admin/ClassroomManager";
import SubjectManager from "../components/Admin/SubjectManager";
import GradeManagement from "../components/Admin/GradeManager";

const AdminDashboard = ({ onLogout }) => {
  const location = useLocation();

  const navItems = [
    {
      name: "AdminManager",
      icon: <Settings size={20} />,
      path: "/admin/admin-manager",
    },
    {
      name: "Teachers",
      icon: <Users size={20} />,
      path: "/admin/teachers",
    },
    {
      name: "Students",
      icon: <GraduationCap size={20} />,
      path: "/admin/students",
    },
    {
      name: "class_Schedules",
      icon: <Calendar size={20} />,
      path: "/admin/schedules",
    },
    {
      name: "exams schedual",
      icon: <LayoutDashboard size={20} />,
      path: "/admin/schedualExamManager",
    },
    {
      name: "Grades",
      icon: <BookOpen size={20} />,
      path: "/admin/grades",
    },
    {
      name: "Classrooms",
      icon: <Users size={20} />,
      path: "/admin/classrooms",
    },
    {
      name: "Subjects",
      icon: <BookOpen size={20} />,
      path: "/admin/subjects",
    },
    {
      name: "Notifications",
      icon: <BellRing size={20} />,
      path: "/admin/notifications",
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans" dir="ltr">
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-100">
              <Settings className="text-white" size={24} />
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tighter">
              Control Center
            </h2>
            <div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-6 py-3 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl transition-all font-black text-xs border border-rose-100"
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all ${
                  location.pathname === item.path ||
                  (item.path !== "/admin" &&
                    location.pathname.startsWith(item.path))
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                    : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                }`}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen">
        <div className="p-8 pt-0 flex-1">
          <Routes>
            <Route path="" element={<Navigate to="admin-manager" replace />} />
            <Route path="students/*" element={<StudentManager />} />
            <Route path="teachers/*" element={<TeacherManager />} />
            <Route path="schedules" element={<ScheduleManager />} />
            <Route path="schedualExamManager" element={<ExamManagement />} />
            <Route path="admin-manager" element={<AdminManager />} />
            <Route path="notifications" element={<NotificationManager />} />
            <Route path="classrooms" element={<ClassroomManager />} />
            <Route path="subjects" element={<SubjectManager />} />
            <Route path="grades" element={<GradeManagement />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
