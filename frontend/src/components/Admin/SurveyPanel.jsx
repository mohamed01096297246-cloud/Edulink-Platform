import React, { useEffect, useState } from "react";
import API from "../../api/axios";
import { ClipboardList, Copy, ExternalLink, Loader2, Lock, RefreshCw, Unlock, X } from "lucide-react";

// The platform owner's view of a school's app-subscription survey (backend
// surveyController): starting it, the link to send students, opening and
// closing it, and the answers — overall and class by class.

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Spelled out whole so Tailwind keeps the classes in the build.
const TONES = { slate: "text-slate-700", emerald: "text-emerald-700", indigo: "text-indigo-700" };

const Tile = ({ label, value, note, tone = "slate" }) => (
  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
    <p className="text-xs font-black text-slate-400">{label}</p>
    <p className={`text-2xl font-black mt-1 tabular-nums ${TONES[tone]}`}>{value}</p>
    {note && <p className="text-xs font-bold text-slate-500 mt-0.5">{note}</p>}
  </div>
);

const SurveyPanel = ({ school, onClose, showToast }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/surveys/school/${school._id}`);
      setData(res.data.data);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر تحميل الاستبيان.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school._id]);

  const start = async () => {
    setBusy(true);
    try {
      await API.post(`/surveys/school/${school._id}`, {});
      await load();
      showToast("الاستبيان جاهز، انسخ الرابط وابعته للطلاب.");
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر بدء الاستبيان.", "error");
    } finally {
      setBusy(false);
    }
  };

  const setOpen = async (open) => {
    setBusy(true);
    try {
      await API.put(`/surveys/school/${school._id}`, { open });
      await load();
      showToast(open ? "الاستبيان اتفتح تاني." : "الاستبيان اتقفل، مفيش ردود جديدة.");
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر تعديل الاستبيان.", "error");
    } finally {
      setBusy(false);
    }
  };

  const survey = data?.survey;
  const link = survey ? `${window.location.origin}/survey/${survey.slug}` : "";
  const totals = data?.totals;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast("اتنسخ الرابط");
    } catch {
      showToast("انسخ الرابط يدويًا من الخانة.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-black">استبيان الاشتراك — {school.name}</h2>
            <p className="text-indigo-50 text-xs font-bold mt-1">
              رابط يفتح على أي موبايل من غير تسجيل دخول: المرحلة، الفصل، نوع التليفون، وهل هيشترك.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full" aria-label="إغلاق">
            <X />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {loading && !data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
          ) : !survey ? (
            <div className="text-center py-12 space-y-4">
              <ClipboardList className="mx-auto text-slate-300" size={44} />
              <p className="font-bold text-slate-600">المدرسة دي لسه مفيهاش استبيان.</p>
              <button
                onClick={start}
                disabled={busy}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm disabled:opacity-50"
              >
                {busy && <Loader2 className="animate-spin" size={16} />}
                ابدأ استبيان الاشتراك
              </button>
              <p className="text-xs font-bold text-slate-400">السعر: أندرويد 250 جنيه، آيفون 300 جنيه في السنة.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-black ${
                      survey.open ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {survey.open ? "مفتوح للردود" : "مقفول"}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    أندرويد {survey.prices.android} جنيه · آيفون {survey.prices.iphone} جنيه في السنة
                  </span>
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    readOnly
                    value={link}
                    dir="ltr"
                    onFocus={(e) => e.target.select()}
                    className="flex-1 p-3 bg-slate-50 rounded-xl font-mono text-xs text-slate-700 outline-none border-2 border-transparent focus:border-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={copyLink}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black"
                    >
                      <Copy size={14} /> نسخ الرابط
                    </button>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-black"
                    >
                      <ExternalLink size={14} /> فتح
                    </a>
                    <button
                      onClick={() => setOpen(!survey.open)}
                      disabled={busy}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black disabled:opacity-50 ${
                        survey.open ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {survey.open ? <Lock size={14} /> : <Unlock size={14} />}
                      {survey.open ? "اقفل الاستبيان" : "افتحه تاني"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-800">النتايج</h3>
                <button
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tile
                  label="الردود"
                  value={totals.responses}
                  note={`من ${totals.students} طالب`}
                />
                <Tile
                  label="هيشتركوا"
                  value={totals.yes}
                  note={`${pct(totals.yes, totals.responses)}% من الردود · لا: ${totals.no}`}
                  tone="emerald"
                />
                <Tile
                  label="أندرويد / آيفون"
                  value={`${totals.android} / ${totals.iphone}`}
                  note={`هيشتركوا: ${totals.yesAndroid} أندرويد، ${totals.yesIphone} آيفون`}
                />
                <Tile
                  label="الإيراد المتوقع في السنة"
                  value={`${totals.revenue.toLocaleString("en-US")} ج`}
                  note="لو كل اللي قالوا نعم اشتركوا"
                  tone="indigo"
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-black">
                    <tr>
                      <th className="p-3">المرحلة</th>
                      <th className="p-3">الفصل</th>
                      <th className="p-3 text-center">الطلاب</th>
                      <th className="p-3 text-center">الردود</th>
                      <th className="p-3 text-center">نعم</th>
                      <th className="p-3 text-center">لا</th>
                      <th className="p-3 text-center">أندرويد</th>
                      <th className="p-3 text-center">آيفون</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-slate-700 tabular-nums">
                    {data.classes.map((c) => (
                      <tr key={c.classroomId}>
                        <td className="p-3 text-slate-500">{c.grade}</td>
                        <td className="p-3 font-black">{c.classroom}</td>
                        <td className="p-3 text-center">{c.students}</td>
                        <td className="p-3 text-center">
                          {c.responses}
                          {c.students > 0 && (
                            <span className="text-[10px] text-slate-400 mr-1">({pct(c.responses, c.students)}%)</span>
                          )}
                        </td>
                        <td className="p-3 text-center text-emerald-700">{c.yes}</td>
                        <td className="p-3 text-center text-rose-600">{c.no}</td>
                        <td className="p-3 text-center">{c.android}</td>
                        <td className="p-3 text-center">{c.iphone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs font-bold text-slate-400">
                الاستبيان من غير أسماء، وكل موبايل بيقدر يسجل رد لأكتر من طالب (إخوات)، فعدد الردود ممكن يختلف شوية عن عدد الطلاب.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurveyPanel;
