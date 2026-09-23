import React, { useCallback, useEffect, useState } from "react";
import API from "../api/axios";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock,
  GraduationCap,
  Loader2,
  LogOut,
  Megaphone,
  RefreshCw,
  Star,
  Sun,
  User,
} from "lucide-react";

// The student's own view on the web — the same four screens as the mobile
// app, on the school's existing site, so a student can use the system from
// any phone browser without installing anything.
//
// It reads the same four endpoints the app does, which return only this
// student's own record. Nothing here writes.

const TABS = [
  { key: "today", label: "يومي", icon: Sun, path: "/student/today" },
  { key: "schedule", label: "الجدول", icon: CalendarDays, path: "/student/schedule" },
  { key: "homework", label: "واجباتي", icon: BookOpen, path: "/student/homework" },
  { key: "grades", label: "درجاتي", icon: GraduationCap, path: "/student/grades" },
];

const DAY_LABELS = {
  sat: "السبت",
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
};

const JS_DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const dueLabel = (dueDate) => {
  const due = new Date(dueDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((due - startOfToday) / 86400000);

  if (days <= 0) return "النهاردة";
  if (days === 1) return "بكرة";
  if (days < 7) return `خلال ${days} أيام`;
  return due.toLocaleDateString("ar-EG");
};

const isUpcoming = (item) =>
  new Date(item.dueDate) >= new Date(new Date().setHours(0, 0, 0, 0));

// Green when comfortable, amber when it needs attention, red when it
// doesn't — read off the ratio, since monthly checks are out of 15 and
// exams out of 100.
const toneFor = (score, outOf) => {
  const ratio = outOf ? score / outOf : 0;
  if (ratio >= 0.75) return "bg-emerald-50 text-emerald-600";
  if (ratio >= 0.5) return "bg-amber-50 text-amber-600";
  return "bg-rose-50 text-rose-600";
};

// Cards sit on a tinted canvas rather than on white, so the page reads as
// a set of surfaces instead of one large white field — the shadow is what
// lifts them, not a hard border.
const Card = ({ children, tone = "bg-white border-slate-200/70" }) => (
  <div
    className={`rounded-3xl border p-4 flex items-center gap-4 shadow-[0_2px_12px_rgba(15,23,42,0.05)] ${tone}`}
  >
    {children}
  </div>
);

const Empty = ({ children }) => (
  <div className="rounded-3xl border border-dashed border-slate-300/80 bg-white/50 p-8 text-center">
    <p className="text-slate-400 font-bold text-sm">{children}</p>
  </div>
);

const Lesson = ({ lesson }) => (
  <Card>
    <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 font-black flex items-center justify-center shrink-0">
      {lesson.period || "—"}
    </div>
    <div className="flex-1">
      <p className="font-black text-slate-800 text-sm">{lesson.subject}</p>
      <p className="text-[12px] font-bold text-slate-400 flex items-center gap-1 mt-0.5">
        <Clock size={12} /> {lesson.startTime} - {lesson.endTime}
      </p>
      {lesson.teacher && (
        <p className="text-[12px] font-bold text-slate-400 flex items-center gap-1">
          <User size={12} /> {lesson.teacher}
        </p>
      )}
    </div>
  </Card>
);

const StudentDashboard = ({ onLogout }) => {
  const [tab, setTab] = useState("today");
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pickedDay, setPickedDay] = useState("");

  const data = cache[tab];

  const load = useCallback(
    async (key, { silent = false } = {}) => {
      const path = TABS.find((t) => t.key === key).path;
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");
        const res = await API.get(path);
        setCache((prev) => ({ ...prev, [key]: res.data?.data }));
      } catch (err) {
        setError(err.response?.data?.message || "تعذّر تحميل البيانات. جرّب تاني.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (cache[tab] === undefined) load(tab);
    else setLoading(false);
  }, [tab, cache, load]);

  const today = cache.today;

  return (
    <div
      className="min-h-screen pb-28 bg-gradient-to-b from-[#E7ECF5] via-[#EDF0F6] to-[#F1F4F9]"
      dir="rtl"
    >
      {/* The school's own navy, so the top of the screen carries the brand
          instead of another sheet of white. */}
      <header className="bg-gradient-to-l from-[#00259E] to-[#1236C4] text-white px-5 pt-5 pb-8 rounded-b-[2rem] shadow-lg shadow-slate-300/40">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="font-black text-lg">
              {today?.student?.fullName || "الطالب"}
            </p>
            <p className="text-[12px] font-bold text-white/70">
              {today?.student?.grade}
              {today?.student?.classroom ? ` · فصل ${today.student.classroom}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(tab, { silent: true })}
              className="p-2.5 rounded-xl text-white/80 bg-white/10 hover:bg-white/20 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onLogout}
              className="p-2.5 rounded-xl text-white/80 bg-white/10 hover:bg-white/20 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Lifted into the header band so the first cards overlap it — the
          page starts with content, not with empty canvas. */}
      <main className="max-w-2xl mx-auto px-5 -mt-5 pb-6 space-y-3">
        {error && (
          <p className="text-rose-600 font-bold text-sm text-center">{error}</p>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="animate-spin inline text-indigo-600" size={36} />
          </div>
        ) : (
          <>
            {tab === "today" && data && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-3xl p-4 text-center border border-slate-200/70 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
                    <p className="text-2xl font-black text-emerald-600">
                      {data.attendance?.present ?? 0}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">حصص حضرتها</p>
                  </div>
                  <div className="bg-white rounded-3xl p-4 text-center border border-slate-200/70 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
                    <p className="text-2xl font-black text-rose-500">
                      {data.attendance?.absent ?? 0}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">حصص غبتها</p>
                  </div>
                </div>

                <h2 className="font-black text-slate-800 text-sm pt-3">
                  حصص {DAY_LABELS[data.today?.day] || "النهاردة"}
                </h2>
                {data.lessons?.length ? (
                  data.lessons.map((l) => <Lesson key={l._id} lesson={l} />)
                ) : (
                  <Empty>مفيش حصص مسجّلة النهاردة</Empty>
                )}

                <h2 className="font-black text-slate-800 text-sm pt-3">واجبات مطلوبة</h2>
                {data.homework?.length ? (
                  data.homework.map((h) => (
                    <Card key={h._id}>
                      <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <BookOpen size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-slate-800 text-sm">{h.title}</p>
                        <p className="text-[12px] font-bold text-slate-400">
                          {h.subject}
                          {h.pageNumber ? ` · ${h.pageNumber}` : ""}
                        </p>
                      </div>
                      <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 text-[11px] font-black shrink-0">
                        {dueLabel(h.dueDate)}
                      </span>
                    </Card>
                  ))
                ) : (
                  <Empty>مفيش واجبات مطلوبة دلوقتي 🎉</Empty>
                )}

                {data.praise?.length > 0 && (
                  <>
                    <h2 className="font-black text-slate-800 text-sm pt-3">
                      ملاحظات معلميك
                    </h2>
                    {data.praise.map((note) => (
                      <Card key={note._id} tone="bg-amber-50 border-amber-100">
                        <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                          <Star size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-amber-900 text-sm">{note.note}</p>
                          {note.subject && (
                            <p className="text-[12px] font-bold text-amber-700/70">
                              {note.subject}
                            </p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </>
                )}

                {data.announcement && (
                  <>
                    <h2 className="font-black text-slate-800 text-sm pt-3">من المدرسة</h2>
                    <Card tone="bg-indigo-50 border-indigo-100">
                      <div className="w-11 h-11 rounded-2xl bg-white text-indigo-600 flex items-center justify-center shrink-0">
                        <Megaphone size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-slate-800 text-sm">
                          {data.announcement.title}
                        </p>
                        <p className="text-[12px] font-bold text-slate-500">
                          {data.announcement.message}
                        </p>
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}

            {tab === "schedule" && data && (
              <>
                {(() => {
                  const days = (data.days || []).filter((d) => d.lessons.length);
                  const todayCode = JS_DAY_CODES[new Date().getDay()];
                  const active =
                    pickedDay ||
                    (days.some((d) => d.day === todayCode) ? todayCode : days[0]?.day);
                  const lessons = days.find((d) => d.day === active)?.lessons || [];

                  if (!days.length) {
                    return <Empty>الجدول لسه مانزلش. هيظهر هنا أول ما المدرسة تنزّله.</Empty>;
                  }

                  return (
                    <>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {days.map((d) => (
                          <button
                            key={d.day}
                            onClick={() => setPickedDay(d.day)}
                            className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap border transition-colors ${
                              d.day === active
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-white border-slate-200 text-slate-500"
                            }`}
                          >
                            {DAY_LABELS[d.day]}
                          </button>
                        ))}
                      </div>
                      {lessons.map((l) => (
                        <Lesson key={l._id} lesson={l} />
                      ))}
                    </>
                  );
                })()}
              </>
            )}

            {tab === "homework" && data && (
              <>
                {!data.length ? (
                  <Empty>مفيش واجبات متسجّلة لفصلك لحد دلوقتي.</Empty>
                ) : (
                  [
                    { title: "المطلوب", items: data.filter(isUpcoming) },
                    { title: "واجبات فاتت", items: data.filter((h) => !isUpcoming(h)) },
                  ].map((group) =>
                    group.items.length ? (
                      <React.Fragment key={group.title}>
                        <h2 className="font-black text-slate-800 text-sm pt-3">
                          {group.title}
                        </h2>
                        {group.items.map((h) => {
                          const done = h.status === "submitted";
                          const missing = h.status === "missing";
                          return (
                            <Card key={h._id}>
                              <div
                                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                                  done
                                    ? "bg-emerald-50 text-emerald-600"
                                    : missing
                                      ? "bg-rose-50 text-rose-600"
                                      : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {done ? (
                                  <CheckCircle2 size={18} />
                                ) : missing ? (
                                  <CircleAlert size={18} />
                                ) : (
                                  <BookOpen size={18} />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="font-black text-slate-800 text-sm">{h.title}</p>
                                <p className="text-[12px] font-bold text-slate-400">
                                  {h.subject}
                                  {h.pageNumber ? ` · ${h.pageNumber}` : ""}
                                </p>
                                <p className="text-[12px] font-bold text-slate-400">
                                  التسليم: {new Date(h.dueDate).toLocaleDateString("ar-EG")}
                                </p>
                              </div>
                              <div className="text-center shrink-0">
                                <p
                                  className={`text-[11px] font-black ${
                                    done
                                      ? "text-emerald-600"
                                      : missing
                                        ? "text-rose-600"
                                        : "text-slate-400"
                                  }`}
                                >
                                  {done ? "سلّمته" : missing ? "مسلّمتوش" : "لسه"}
                                </p>
                                {h.score !== null && h.score !== undefined && (
                                  <p className="font-black text-slate-800 text-sm">
                                    {h.score}/{h.totalMarks}
                                  </p>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </React.Fragment>
                    ) : null,
                  )
                )}
              </>
            )}

            {tab === "grades" && data && (
              <>
                {!data.exams?.length && !data.monthly?.length && (
                  <Empty>لسه مفيش درجات متسجّلة. هتظهر هنا أول ما المعلمين يرصدوها.</Empty>
                )}

                {data.exams?.length > 0 && (
                  <>
                    <h2 className="font-black text-slate-800 text-sm pt-3">الامتحانات</h2>
                    {data.exams.map((e) => (
                      <Card key={e._id}>
                        <div
                          className={`w-14 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 ${toneFor(e.grade, 100)}`}
                        >
                          <span className="font-black text-lg leading-none">{e.grade}</span>
                          <span className="text-[9px] font-black">من 100</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-slate-800 text-sm">{e.subject}</p>
                          <p className="text-[12px] font-bold text-slate-400">{e.exam}</p>
                        </div>
                      </Card>
                    ))}
                  </>
                )}

                {data.monthly?.length > 0 && (
                  <>
                    <h2 className="font-black text-slate-800 text-sm pt-3">
                      اختبارات شهرية
                    </h2>
                    {data.monthly.map((m) => (
                      <Card key={m._id}>
                        <div
                          className={`w-14 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 ${toneFor(m.grade, m.outOf)}`}
                        >
                          <span className="font-black text-lg leading-none">{m.grade}</span>
                          <span className="text-[9px] font-black">من {m.outOf}</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-slate-800 text-sm">{m.subject}</p>
                          <p className="text-[12px] font-bold text-slate-400">
                            {MONTHS[m.month - 1] || m.month} {m.year}
                          </p>
                        </div>
                      </Card>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      <nav className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-[0_8px_30px_rgba(15,23,42,0.12)] flex items-center justify-around h-[72px] z-30">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className="flex-1 h-full flex flex-col items-center justify-center gap-0.5"
            >
              <span
                className={`w-10 h-8 rounded-xl flex items-center justify-center ${active ? "bg-indigo-50" : ""}`}
              >
                <Icon size={20} className={active ? "text-indigo-700" : "text-slate-400"} />
              </span>
              <span
                className={`text-[10px] font-black ${active ? "text-indigo-700" : "text-slate-400"}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default StudentDashboard;
