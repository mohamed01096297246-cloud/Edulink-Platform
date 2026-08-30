import React, { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  DoorOpen,
  Users,
  GraduationCap,
  Calendar,
  ClipboardCheck,
  BellRing,
  ShieldCheck,
  Building2,
  LogOut,
  Wallet,
  BarChart3,
  UserCheck,
  ChevronDown,
  ClipboardList,
  UserCog,
  Landmark,
  MessageSquareText,
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
import AdminOverview from "../components/Admin/AdminOverview";
import PlatformOverview from "../components/Admin/PlatformOverview";
import SchoolManager from "../components/Admin/SchoolManager";
import FeeManager from "../components/Admin/FeeManager";
import ExamAnalytics from "../components/Admin/ExamAnalytics";
import TeacherAttendanceManager from "../components/Admin/TeacherAttendanceManager";

// Grouped the way MySchool and every mature school system organizes its
// menu — by area of the school, not one flat list — but scoped to what
// EduLink actually is: no site-builder/CMS/translation categories, since
// those aren't part of running a school's academic and operational core.
// "Overview" stays outside every group: it's the landing page, not a
// category member.
const NAV_GROUPS = [
  {
    name: "الإعداد",
    icon: <Layers size={18} />,
    items: [
      { name: "المراحل الدراسية", icon: <Layers size={18} />, path: "/admin/grades" },
      { name: "الفصول", icon: <DoorOpen size={18} />, path: "/admin/classrooms" },
      { name: "المواد", icon: <BookOpen size={18} />, path: "/admin/subjects" },
    ],
  },
  {
    name: "الأفراد",
    icon: <Users size={18} />,
    items: [
      { name: "المعلمين", icon: <Users size={18} />, path: "/admin/teachers" },
      { name: "الطلاب", icon: <GraduationCap size={18} />, path: "/admin/students" },
      { name: "حسابات الإدارة", icon: <UserCog size={18} />, path: "/admin/admin-manager" },
    ],
  },
  {
    name: "الأكاديمي",
    icon: <ClipboardList size={18} />,
    items: [
      { name: "الجدول الدراسي", icon: <Calendar size={18} />, path: "/admin/schedules" },
      { name: "الامتحانات", icon: <ClipboardCheck size={18} />, path: "/admin/schedualExamManager" },
      { name: "تحليلات النتائج", icon: <BarChart3 size={18} />, path: "/admin/exam-analytics", feature: "examAnalytics" },
    ],
  },
  {
    name: "الموظفين",
    icon: <UserCheck size={18} />,
    items: [
      { name: "حضور المعلمين", icon: <UserCheck size={18} />, path: "/admin/staff-attendance", feature: "staffAttendance" },
    ],
  },
  {
    name: "المالية",
    icon: <Landmark size={18} />,
    items: [
      { name: "الأقساط والمصروفات", icon: <Wallet size={18} />, path: "/admin/fees", feature: "fees" },
    ],
  },
  {
    name: "التواصل",
    icon: <MessageSquareText size={18} />,
    items: [
      { name: "الإشعارات", icon: <BellRing size={18} />, path: "/admin/notifications" },
    ],
  },
];

const AdminDashboard = ({ onLogout }) => {
  const location = useLocation();
  const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const isSuperAdmin = !!userInfo.isSuperAdmin;

  // The platform owner isn't attached to any one school, so none of the
  // per-school operational categories below (setup/people/academics/...)
  // mean anything for them — every one of those screens either requires a
  // school context they don't have, or is a different school's own admin's
  // job to run. They get PlatformOverview + Schools only; a school's own
  // admin/sub-admin gets the full set exactly as before.
  // A school on a lighter subscription tier can have specific modules
  // switched off by the platform owner (see SchoolManager's feature
  // toggles) — filter those out here, and drop any group left empty as a
  // result, instead of showing a category with nothing clickable inside it.
  const features = userInfo.features;
  const visibleGroups = isSuperAdmin
    ? []
    : NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.feature || !features || features[item.feature] !== false,
        ),
      })).filter((group) => group.items.length > 0);

  // Open by default whichever group contains the current page, so landing
  // on e.g. Fees doesn't leave every category looking collapsed/empty.
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = new Set();
    NAV_GROUPS.forEach((group) => {
      if (
        !isSuperAdmin &&
        group.items.some((item) => location.pathname.startsWith(item.path))
      ) {
        initial.add(group.name);
      }
    });
    return initial;
  });

  const toggleGroup = (name) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans" dir="rtl">
      <aside className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col sticky top-0 h-screen overflow-hidden">
        <div className="p-8 pb-4 flex items-center gap-3 flex-shrink-0">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-100">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tighter">
            {isSuperAdmin ? "لوحة تحكم المنصة" : "لوحة التحكم"}
          </h2>
        </div>

        <nav className="space-y-1 px-8 flex-1 overflow-y-auto">
          <Link
            to="/admin/overview"
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all mb-3 ${
              location.pathname.startsWith("/admin/overview")
                ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
            }`}
          >
            <LayoutDashboard size={20} />
            {isSuperAdmin ? "نظرة عامة على المنصة" : "نظرة عامة"}
          </Link>

          {visibleGroups.map((group) => {
            const isOpen = openGroups.has(group.name);
            const hasActiveItem = group.items.some((item) =>
              location.pathname.startsWith(item.path),
            );

            return (
              <div key={group.name} className="pb-1">
                <button
                  onClick={() => toggleGroup(group.name)}
                  className={`w-full flex items-center gap-3 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                    hasActiveItem ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {group.icon}
                  <span className="flex-1 text-right">{group.name}</span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-1 mt-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.name}
                        to={item.path}
                        className={`flex items-center gap-3 pr-9 pl-5 py-3 rounded-xl font-bold text-sm transition-all ${
                          location.pathname.startsWith(item.path)
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                            : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
                        }`}
                      >
                        {item.icon}
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isSuperAdmin && (
            <Link
              to="/admin/schools"
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all mt-3 ${
                location.pathname.startsWith("/admin/schools")
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                  : "text-slate-500 hover:bg-slate-50 hover:text-blue-600"
              }`}
            >
              <Building2 size={20} />
              المدارس
            </Link>
          )}
        </nav>

        <div className="p-8 pt-4 flex-shrink-0">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl transition-all font-black text-xs border border-rose-100"
          >
            <LogOut size={16} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1">
          <Routes>
            <Route path="" element={<Navigate to="overview" replace />} />
            <Route
              path="overview"
              element={isSuperAdmin ? <PlatformOverview /> : <AdminOverview />}
            />
            <Route path="students/*" element={<StudentManager />} />
            <Route path="fees" element={<FeeManager />} />
            <Route path="teachers/*" element={<TeacherManager />} />
            <Route path="staff-attendance" element={<TeacherAttendanceManager />} />
            <Route path="schedules" element={<ScheduleManager />} />
            <Route path="schedualExamManager" element={<ExamManagement />} />
            <Route path="exam-analytics" element={<ExamAnalytics />} />
            <Route path="admin-manager" element={<AdminManager />} />
            <Route path="notifications" element={<NotificationManager />} />
            <Route path="classrooms" element={<ClassroomManager />} />
            <Route path="subjects" element={<SubjectManager />} />
            <Route path="grades" element={<GradeManagement />} />
            {userInfo.isSuperAdmin && (
              <Route path="schools" element={<SchoolManager />} />
            )}
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
