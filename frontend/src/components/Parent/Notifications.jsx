import React, { useState, useEffect } from "react";
import axios from "axios";
import { Bell, AlertCircle, Info, Loader2 } from "lucide-react";

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        "http://localhost:5000/api/notifications/parent",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setNotifications(res.data);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-indigo-600" />
      </div>
    );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
        <Bell className="text-indigo-600" /> My Notifications
      </h2>

      {notifications.length === 0 ? (
        <div className="text-center py-10 text-slate-400 font-bold">
          No new notifications
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`p-6 rounded-2xl border-l-4 shadow-sm ${n.target === "all" ? "bg-indigo-50 border-indigo-500" : "bg-amber-50 border-amber-500"}`}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-black text-slate-800 text-lg">{n.title}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg ${n.target === "all" ? "bg-indigo-200 text-indigo-700" : "bg-amber-200 text-amber-700"}`}
                >
                  {n.target === "all" ? "GENERAL" : "PRIVATE"}
                </span>
              </div>
              <p className="text-slate-600 font-medium mt-2">{n.message}</p>
              <p className="text-[10px] text-slate-400 font-bold mt-4">
                {new Date(n.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
