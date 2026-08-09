import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { Toaster } from "react-hot-toast";
import Login from "./pages/Login";
import TeacherDashboard from "./pages/TeacherDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ParentDashboard from "./pages/ParentDashboard";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));
  const [userRole, setUserRole] = useState(
    localStorage.getItem("role")?.toLowerCase() || null,
  );
  const handleLogin = (role) => {
    setIsLoggedIn(true);
    setUserRole(role.toLowerCase());
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUserRole(null);
  };

  return (
    <Router>
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: "cairo, sans-serif", 
            fontWeight: "bold",
          },
        }}
      />

      <Routes>
        <Route
          path="/login"
          element={
            !isLoggedIn ? (
              <Login onLogin={handleLogin} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/"
          element={
            !isLoggedIn ? (
              <Navigate to="/login" replace />
            ) : (
              <Navigate to={`/${userRole}`} replace />
            )
          }
        />

        <Route
          path="/admin/*"
          element={
            isLoggedIn && userRole === "admin" ? (
              <AdminDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/teacher/*"
          element={
            isLoggedIn && userRole === "teacher" ? (
              <TeacherDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/parent/*"
          element={
            isLoggedIn && userRole === "parent" ? (
              <ParentDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
