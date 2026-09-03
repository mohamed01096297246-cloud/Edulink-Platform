import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  LockKeyhole,
  User,
  Loader2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import "./pagesCss/login.css";
import { API_URL } from "../api/axios";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        username: username.trim(),
        password: password,
      });
      const { token, user } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("role", user.role.toLowerCase());
      localStorage.setItem("userInfo", JSON.stringify(user));
      onLogin(user.role);
      const role = user.role.toLowerCase();
      if (role === "admin") {
        navigate("/admin");
      } else if (role === "teacher") {
        navigate("/teacher");
      } else if (role === "parent") {
        navigate("/parent");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "فشل الاتصال بالسيرفر، حاول مرة أخرى.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" dir="rtl">
      <div className="left-side">
        <h1 className="logo">
          Edu <span>Link</span>
        </h1>
        <ul>
          <li>النظام يسهّل العمليات الإدارية داخل المدرسة ويوفّر متابعة مستمرة لأولياء الأمور</li>
          <li>النظام يسهّل إدارة بيانات الطلاب ومتابعة أدائهم الأكاديمي</li>
          <li>النظام يسهّل التواصل بين المدرسة وأولياء الأمور</li>
        </ul>
        <hr />
        <ul>
          <h3>يقدر ولي الأمر يتابع أبناءه في:</h3>
          <li>الحضور والغياب</li>
          <li>الأداء الأكاديمي والدرجات</li>
          <li>الجدول الدراسي والإعلانات</li>
          <li>الواجبات ومواعيد تسليمها</li>
          <li>السلوك والسجلات التأديبية</li>
        </ul>
      </div>
      <div className=" right-side ">
        <div>
          <div className="text">
            <h1>نظام إدارة المدرسة</h1>
            <p>تسجيل الدخول إلى EduLink</p>
          </div>

          <div className="form-container">
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold animate-shake">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}


              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 mr-2 uppercase tracking-wider">
                  اسم المستخدم
                </label>
                <div className="relative group">
                  <User
                    className="absolute right-4 top-4 text-slate-300 group-focus-within:text-indigo-600 transition-colors"
                    size={20}
                  />
                  <input
                    required
                    type="text"
                    placeholder="أدخل اسم المستخدم"
                    className="login-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 mr-2 uppercase tracking-wider">
                  كلمة المرور
                </label>
                <div className="relative group">
                  <LockKeyhole
                    className="absolute right-4 top-4 text-slate-300 group-focus-within:text-indigo-600 transition-colors"
                    size={20}
                  />
                  <input
                    required
                    type="password"
                    placeholder="••••••••"
                    className="login-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                disabled={loading}
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 group"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    تسجيل الدخول
                    <ChevronLeft
                      size={20}
                      className="group-hover:-translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
