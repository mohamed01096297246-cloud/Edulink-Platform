import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { API_URL } from "../api/axios";

// The app-subscription survey a school sends its students as a link
// (backend surveyController): the grade and the class, and that's all — an
// answer is a subscription, and the page shows no price. No login and no
// name. A phone that has answered remembers it, and can still answer for a
// brother or sister.

const answeredKey = (slug) => `survey:${slug}:answered`;

const remembered = (slug) => {
  try {
    return localStorage.getItem(answeredKey(slug)) === "1";
  } catch {
    return false;
  }
};

const remember = (slug) => {
  try {
    localStorage.setItem(answeredKey(slug), "1");
  } catch {
    // Private browsing: the answer is in; only the reminder is lost.
  }
};

// A step of the form: its number, its question, and the choices under it.
const Step = ({ number, title, children, muted = false }) => (
  <section
    className={`bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm transition-opacity ${
      muted ? "opacity-50" : ""
    }`}
  >
    <div className="flex items-center gap-3 mb-4">
      <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-black text-sm flex items-center justify-center tabular-nums">
        {number}
      </span>
      <h2 className="font-black text-slate-800 text-base">{title}</h2>
    </div>
    {children}
  </section>
);

const Choice = ({ active, onClick, children, className = "" }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-2xl border-2 px-4 py-3 font-bold text-sm transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 ${
      active
        ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200"
        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300"
    } ${className}`}
  >
    {children}
  </button>
);

const Survey = () => {
  const { slug } = useParams();
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [gradeId, setGradeId] = useState("");
  const [classroomId, setClassroomId] = useState("");

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [answered, setAnswered] = useState(() => remembered(slug));

  useEffect(() => {
    // Arabic set in Cairo, on this page only.
    if (!document.getElementById("survey-font")) {
      const link = document.createElement("link");
      link.id = "survey-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;900&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/surveys/public/${encodeURIComponent(slug)}`);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(body.message || "تعذّر فتح الاستبيان الآن.");
        } else {
          setSurvey(body.data);
          document.title = `${body.data.title} — ${body.data.school}`;
        }
      } catch {
        if (!cancelled) setLoadError("لا يوجد اتصال بالإنترنت. تأكد من الشبكة وحاول مرة أخرى.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const grade = survey?.grades.find((g) => g._id === gradeId);
  const ready = Boolean(classroomId);

  const startOver = () => {
    setGradeId("");
    setClassroomId("");
    setSendError("");
    setAnswered(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`${API_URL}/surveys/public/${encodeURIComponent(slug)}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(body.message || "لم يتم إرسال الرد. حاول مرة أخرى.");
        return;
      }
      remember(slug);
      setAnswered(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSendError("لا يوجد اتصال بالإنترنت. تأكد من الشبكة وحاول مرة أخرى.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-100 text-slate-800"
      style={{ fontFamily: "Cairo, system-ui, sans-serif" }}
    >
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        <header className="text-center space-y-1 pb-2">
          <p className="text-xs font-black tracking-widest text-indigo-600">EduLink</p>
          {survey && <h1 className="text-2xl font-black text-slate-900">{survey.school}</h1>}
          <p className="text-sm font-bold text-slate-500">
            {survey ? survey.title : "استبيان"}
          </p>
        </header>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-white rounded-3xl border border-rose-200 p-6 text-center space-y-2">
            <AlertCircle className="mx-auto text-rose-500" size={28} />
            <p className="font-bold text-slate-700">{loadError}</p>
          </div>
        )}

        {survey && !survey.open && !answered && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-2">
            <p className="font-black text-slate-800">تم إغلاق هذا الاستبيان.</p>
            <p className="text-sm font-bold text-slate-500">شكرًا لاهتمامك.</p>
          </div>
        )}

        {survey && answered && (
          <div className="bg-white rounded-3xl border border-emerald-200 p-7 text-center space-y-4 shadow-sm">
            <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
            <p className="text-xl font-black text-slate-900">شكرًا لك، تم تسجيل ردك</p>
            {survey.open && (
              <button
                type="button"
                onClick={startOver}
                className="text-sm font-black text-indigo-700 underline underline-offset-4"
              >
                تسجيل رد لطالب آخر من نفس الهاتف
              </button>
            )}
          </div>
        )}

        {survey && survey.open && !answered && (
          <>
            <Step number="1" title="اختر المرحلة">
              <div className="grid gap-2">
                {survey.grades.map((g) => (
                  <Choice
                    key={g._id}
                    active={gradeId === g._id}
                    onClick={() => {
                      setGradeId(g._id);
                      setClassroomId("");
                    }}
                    className="text-right"
                  >
                    {g.name}
                  </Choice>
                ))}
              </div>
            </Step>

            <Step number="2" title="اختر الفصل" muted={!grade}>
              {grade ? (
                <div className="grid grid-cols-4 gap-2">
                  {grade.classrooms.map((c) => (
                    <Choice key={c._id} active={classroomId === c._id} onClick={() => setClassroomId(c._id)}>
                      {c.name}
                    </Choice>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-400">اختر المرحلة أولًا.</p>
              )}
            </Step>

            {sendError && (
              <p className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3.5 text-sm font-bold text-center">
                {sendError}
              </p>
            )}

            <button
              type="button"
              onClick={send}
              disabled={!ready || sending}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 font-black text-white shadow-lg shadow-indigo-200 transition-all disabled:opacity-40 disabled:shadow-none focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
            >
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              إرسال الرد
            </button>
            {!ready && (
              <p className="text-center text-xs font-bold text-slate-400">اختر المرحلة والفصل لإرسال الرد.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Survey;
