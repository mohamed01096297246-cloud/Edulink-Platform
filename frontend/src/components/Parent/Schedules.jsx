import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Calendar,
  Clock,
  BookOpen,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";

function Schedules({ classroomId }) {
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = localStorage.getItem("token");
  const API_URL = "http://localhost:5000/api";
  const daysOfWeek = ["sun", "mon", "tue", "wed", "thu"];
  const timeSlots = [
    { start: "08:00", end: "09:00", label: "08:00 AM - 09:00 AM" },
    { start: "09:00", end: "10:00", label: "09:00 AM - 10:00 AM" },
    { start: "10:00", end: "11:00", label: "10:00 AM - 11:00 AM" },
    {
      start: "11:00",
      end: "12:00",
      label: "11:00 AM - 12:00 PM",
      isBreak: true,
    },
    { start: "12:00", end: "13:00", label: "12:00 PM - 01:00 PM" },
  ];

  const dayTranslation = {
    sun: "Sunday",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
  };
  const accentColors = [
    "border-r-2 border-r-indigo-500 bg-indigo-50/30",
    "border-r-2 border-r-emerald-500 bg-emerald-50/30",
    "border-r-2 border-r-amber-500 bg-amber-50/30",
    "border-r-2 border-r-sky-500 bg-sky-50/30",
    "border-r-2 border-r-rose-500 bg-rose-50/30",
  ];

  useEffect(() => {
    if (
      classroomId &&
      classroomId !== "غير محدد" &&
      classroomId !== "undefined"
    ) {
      fetchSchedule();
    } else {
      setLoading(false);
    }
  }, [classroomId]);

  const fetchSchedule = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await axios.get(`${API_URL}/schedules/class/${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const formattedSchedule = {};
      daysOfWeek.forEach((day) => {
        formattedSchedule[day] = [];
      });

      const scheduleData = res.data || [];
      scheduleData.forEach((slot) => {
        const dayLower = slot.day?.toLowerCase();
        if (formattedSchedule[dayLower]) {
          formattedSchedule[dayLower].push(slot);
        }
      });

      setSchedule(formattedSchedule);
    } catch (err) {
      console.error("Error fetching schedule:", err);
      setError("Failed to load the weekly schedule.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
        <p className="text-slate-500 text-xs font-bold">
          Loading schedule table...
        </p>
      </div>
    );
  }

  if (
    !classroomId ||
    classroomId === "غير محدد" ||
    classroomId === "undefined"
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <AlertCircle size={40} className="text-amber-500" />
        <h3 className="text-md font-black text-slate-700">
          Student Not Enrolled
        </h3>
        <p className="text-slate-400 text-xs max-w-sm">
          Please assign a classroom first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="ltr">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Calendar size={18} className="text-indigo-600" />
        <h2 className="text-md font-black text-slate-800">
          Class Academic Schedule
        </h2>
      </div>

      {error && (
        <div className="p-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold flex items-center gap-1">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full border-collapse text-left min-w-[800px]">
          <thead>
            <tr className="bg-[#1e40af] text-white">
              <th className="p-4 text-xs font-black tracking-wider uppercase text-center border-b border-blue-800 w-[12%]">
                DAY
              </th>
              {timeSlots.map((slot, index) => (
                <th
                  key={index}
                  className="p-3 text-center border-b border-blue-800 border-l border-blue-700/50 w-[17.6%]"
                >
                  <div className="inline-flex flex-col items-center bg-blue-900/40 px-3 py-1.5 rounded-xl border border-blue-700/60 min-w-[120px]">
                    <span className="text-[10px] font-bold text-blue-200 uppercase tracking-tight flex items-center gap-1 mb-0.5">
                      <Clock size={10} />{" "}
                      {slot.isBreak ? "Break Time" : `Period ${index + 1}`}
                    </span>
                    <span className="text-[11px] font-black font-mono tracking-wide text-white">
                      {slot.start} - {slot.end}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {daysOfWeek.map((day) => {
              const dayLessons = schedule[day] || [];
              return (
                <tr
                  key={day}
                  className="hover:bg-slate-50/50 transition-colors group"
                >
                  <td className="p-4 text-center font-black text-slate-700 bg-slate-50/80 border-r border-slate-200 text-xs">
                    {dayTranslation[day]}
                  </td>
                  {timeSlots.map((slot, slotIdx) => {
                    if (slot.isBreak) {
                      return (
                        <td
                          key={slotIdx}
                          className="p-2 text-center border-l border-slate-100 bg-amber-50/40"
                        >
                          <div className="py-2.5 px-2 bg-amber-100/60 text-amber-800 rounded-xl font-black text-xs tracking-wider flex items-center justify-center gap-1.5 shadow-xs border border-amber-200/50">
                            <span>☕</span>
                            <span className="uppercase font-extrabold text-[10px]">
                              Break
                            </span>
                          </div>
                        </td>
                      );
                    }
                    const lesson = dayLessons.find(
                      (l) =>
                        l.startTime &&
                        l.startTime.substring(0, 5) === slot.start,
                    );
                    const colorStyle =
                      accentColors[slotIdx % accentColors.length];

                    return (
                      <td
                        key={slotIdx}
                        className="p-2 border-l border-slate-100 vertical-middle"
                      >
                        {lesson ? (
                          <div
                            className={`p-2 rounded-xl border border-slate-100 shadow-xs transition-all flex flex-col justify-center min-h-[60px] ${colorStyle}`}
                          >
                            <h4
                              className="font-bold text-slate-900 text-xs truncate text-right"
                              dir="rtl"
                            >
                              {lesson.subject?.name || "المادة"}
                            </h4>
                            <p
                              className="text-slate-500 text-[10px] font-medium truncate mt-1 flex items-center justify-start gap-0.5"
                              dir="rtl"
                            >
                              <User
                                size={9}
                                className="text-slate-400 shrink-0"
                              />
                              <span className="truncate">
                                {lesson.teacher
                                  ? `${lesson.teacher.firstName} ${lesson.teacher.lastName}`
                                  : "غير محدد"}
                              </span>
                            </p>
                          </div>
                        ) : (
                          <div className="py-3 text-center text-[10px] font-semibold text-slate-300 italic">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Schedules;
