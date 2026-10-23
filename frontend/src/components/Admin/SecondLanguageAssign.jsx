import React, { useEffect, useMemo, useState } from "react";
import API from "../../api/axios";
import { X, Loader2, Save, Languages, Search, AlertCircle } from "lucide-react";

// «مادة ثانية»: which language each pupil of one class sits in the period
// its timetable splits between languages. Only the class's own languages are
// offered; a pupil left without one stays on every language's list (and sees
// «مادة ثانية» on their timetable) until given one.

const NONE = "";

const SecondLanguageAssign = ({ classroom, canEdit, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [languages, setLanguages] = useState([]);
  const [students, setStudents] = useState([]);
  const [chosen, setChosen] = useState({}); // student id → language id ("" none)
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await API.get("/students/second-language", { params: { classroom: classroom._id } });
        if (!alive) return;
        const data = res.data?.data || {};
        setLanguages(data.languages || []);
        setStudents(data.students || []);
        setChosen(
          Object.fromEntries((data.students || []).map((s) => [s._id, s.secondLanguage ? String(s.secondLanguage) : NONE])),
        );
      } catch (err) {
        if (alive) setError(err.response?.data?.message || "تعذّر تحميل طلاب الفصل.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [classroom._id]);

  const original = useMemo(
    () => Object.fromEntries(students.map((s) => [s._id, s.secondLanguage ? String(s.secondLanguage) : NONE])),
    [students],
  );
  const changed = students.filter((s) => (chosen[s._id] ?? NONE) !== original[s._id]);
  const countOf = (languageId) => students.filter((s) => (chosen[s._id] ?? NONE) === languageId).length;
  const shown = students.filter((s) => !search.trim() || s.name.includes(search.trim()));

  const setAll = (languageId) =>
    setChosen((prev) => ({ ...prev, ...Object.fromEntries(shown.map((s) => [s._id, languageId])) }));

  const save = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await API.put("/students/second-language", {
        classroom: classroom._id,
        assignments: changed.map((s) => ({ student: s._id, language: chosen[s._id] || null })),
      });
      onSaved?.(res.data?.message || "اتحفظ التوزيع");
      setStudents((prev) => prev.map((s) => ({ ...s, secondLanguage: chosen[s._id] || null })));
    } catch (err) {
      setError(err.response?.data?.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Languages className="text-amber-600" size={22} /> توزيع الطلاب على المادة الثانية
            </h2>
            <p className="text-slate-400 text-xs font-bold mt-1">
              فصل {classroom.name} — {classroom.grade?.name}. كل طالب يحضر حصة لغته مع مدرسها، ويظهرله في جدوله.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors" aria-label="إغلاق">
            <X />
          </button>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
            <Loader2 className="animate-spin text-indigo-500" size={40} />
          </div>
        ) : languages.length === 0 ? (
          <p className="p-10 text-center font-bold text-slate-400">
            الفصل ده مفيش في جدوله حصة «مادة ثانية» لسه. ضيفها من الجدول الأول.
          </p>
        ) : (
          <>
            <div className="px-6 pt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {languages.map((l) => (
                  <span key={l._id} className="text-xs font-black bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1.5 rounded-xl">
                    {l.name}
                    {l.teacher ? ` · أ. ${l.teacher}` : ""}: {countOf(String(l._id))} طالب
                  </span>
                ))}
                <span className="text-xs font-black bg-slate-50 text-slate-500 border border-slate-100 px-3 py-1.5 rounded-xl">
                  لسه ماتحددش: {countOf(NONE)}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="دوّر باسم الطالب"
                    className="w-full pr-9 pl-3 py-2.5 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-sm"
                  />
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-1.5">
                    {languages.map((l) => (
                      <button
                        key={l._id}
                        type="button"
                        onClick={() => setAll(String(l._id))}
                        className="text-xs font-black px-3 py-2 rounded-xl bg-white border-2 border-slate-100 text-slate-600 hover:border-amber-300 hover:text-amber-800"
                      >
                        {search.trim() ? "اللي ظاهرين" : "الكل"}: {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 font-bold text-xs">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-1.5">
              {shown.map((s) => {
                const current = chosen[s._id] ?? NONE;
                return (
                  <div
                    key={s._id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border p-2.5 ${
                      current !== original[s._id] ? "border-amber-200 bg-amber-50/40" : "border-slate-100"
                    }`}
                  >
                    <span className="text-sm font-black text-slate-700">{s.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {languages.map((l) => {
                        const on = current === String(l._id);
                        return (
                          <button
                            key={l._id}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setChosen((prev) => ({ ...prev, [s._id]: String(l._id) }))}
                            className={`text-xs font-black px-3 py-1.5 rounded-xl border-2 transition-all ${
                              on
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-white border-slate-100 text-slate-500 hover:border-amber-300"
                            }`}
                          >
                            {l.name}
                          </button>
                        );
                      })}
                      {current !== NONE && canEdit && (
                        <button
                          type="button"
                          onClick={() => setChosen((prev) => ({ ...prev, [s._id]: NONE }))}
                          className="text-[11px] font-bold px-2 py-1.5 rounded-xl text-slate-400 hover:text-rose-600"
                        >
                          شيل
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {shown.length === 0 && (
                <p className="py-10 text-center text-sm font-bold text-slate-400">مفيش طلاب بالاسم ده.</p>
              )}
            </div>

            {canEdit && (
              <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-500">
                  {changed.length ? `${changed.length} طالب اتغيّرت لغتهم` : "مفيش تغييرات لسه"}
                </span>
                <button
                  type="button"
                  disabled={saving || changed.length === 0}
                  onClick={save}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  حفظ التوزيع
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SecondLanguageAssign;
