import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./sidebar.css";
const Sidebar = () => {
  const location = useLocation();
  const menuItems = [
    { path: "/parent/schedule", icon: "📅", label: "Schedule" },
    { path: "/parent/attendance", icon: "✅", label: "Attendance" },
    { path: "/parent/homework", icon: "📚", label: "Homework" },
    { path: "/parent/exams", icon: "📝", label: "Exams Schedule" },
    { path: "/parent/grades", icon: "📝", label: "Exam Grades" },
    { path: "/parent/behavior", icon: "⭐", label: "Behavioral Records" },
    { path: "/parent/notifications", icon: "🔔", label: "Notifications" },
  ];
  return (
    <aside className={"sidebar"}>
      <div className="mb-10 px-2">
        <h2 className={"title"}>
          <span className="bg-blue-600 p-1 rounded-lg text-white">Edue</span>{" "}
          Link
        </h2>
      </div>

      <nav className="flex flex-col gap-2 flex-1">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group ${
              location.pathname === item.path ? "menu-item-active" : "menu-item"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-semibold">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
};
export default Sidebar;
