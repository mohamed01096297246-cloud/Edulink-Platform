import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import { PenLine, Loader2, Save, CheckCircle2, AlertCircle, Wand2 } from "lucide-react";

// رصد الدرجات من الإدارة: the school's admin copies the teachers' paper
// registers into the system — pick the class, the subject and the week (or
// the term's test), type the marks down the columns, save. Everything lands
// in the teacher's own register (backend controllers/adminMarksController.js),
// so the teacher sees it as theirs and can still change it.
//
// Made for someone who doesn't use computers much: three choices, one
// table laid out like the paper, Enter goes down the column as you copy it,
// Arabic digits are fine, and nothing is lost by accident.

const REMEMBER_KEY = "adminMarks:last";

// Arabic-Indic and Persian digits, and the Arabic decimal comma, to plain ones.
const toLatin = (text) =>
  String(text ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫،,]/g, ".")
    .trim();

const shownAs = (value) => (value === null || value === undefined ? "" : String(value));

const fmtDay = (iso) => {
  const [, m, d] = String(iso).split("-");
  return `${Number(d)}/${Number(m)}`;
};

const readRemembered = () => {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) || "{}");
  } catch {
    return {};
  }
};

const AdminMarks = () => {
  const { canEdit } = useAdminScope();
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState("");

  const remembered = useRef(readRemembered());
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sheetKey, setSheetKey] = useState(""); // "week:2026-10-18" or "test:1:2"

  const [sheet, setSheet] = useState(null); // { columns, total, students }
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [typed, setTyped] = useState({}); // `${studentId}:${column}` → text
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [saveError, setSaveError] = useState("");
  const inputs = useRef({});

  useEffect(() => {
    API.get("/admin-marks/options")
      .then((res) => {
        const data = res.data?.data;
        setOptions(data);
        const last = remembered.current;
        const cls = data.classes.find((c) => c._id === last.classId) || null;
        if (cls) {
          setClassId(cls._id);
          if (cls.subjects.some((s) => s._id === last.subjectId)) setSubjectId(last.subjectId);
        }
        setSheetKey(data.weeks[0] ? `week:${data.weeks[0].weekStart}` : "");
      })
      .catch((err) => setLoadError(err.response?.data?.message || "تعذّر تحميل الفصول."));
  }, []);

  const currentClass = options?.classes.find((c) => c._id === classId) || null;
  const currentSubject = currentClass?.subjects.find((s) => s._id === subjectId) || null;

  // Every typed cell that differs from what is saved.
  const changes = useMemo(() => {
    if (!sheet) return [];
    const out = [];
    for (const student of sheet.students) {
      for (const column of sheet.columns) {
        const key = `${student._id}:${column.key}`;
        if (!(key in typed)) continue;
        const text = toLatin(typed[key]);
        const before = shownAs(student.marks[column.key]);
        if (text === before) continue;
        const value = text === "" ? null : Number(text);
        const invalid =
          value !== null && (!Number.isFinite(value) || value < 0 || value > column.max);
        out.push({ key, student: student._id, column: column.key, value, invalid });
      }
    }
    return out;
  }, [sheet, typed]);
  const invalidCount = changes.filter((c) => c.invalid).length;
  const changedStudents = new Set(changes.map((c) => c.student)).size;

  const confirmLeave = () =>
    changes.length === 0 || window.confirm("فيه درجات اتكتبت ولسه ماتحفظتش. تسيبها وتكمّل؟");

  useEffect(() => {
    const warn = (e) => {
      if (changes.length === 0) return undefined;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  const loadSheet = useCallback(async () => {
    if (!classId || !subjectId || !sheetKey) {
      setSheet(null);
      return;
    }
    setSheetLoading(true);
    setSheetError("");
    setSaved("");
    setSaveError("");
    try {
      const [kind, a, b] = sheetKey.split(":");
      const res =
        kind === "week"
          ? await API.get("/admin-marks/week", { params: { classroom: classId, subject: subjectId, weekStart: a } })
          : await API.get("/admin-marks/test", { params: { classroom: classId, subject: subjectId, term: a, testNo: b } });
      setSheet(res.data?.data || null);
      setTyped({});
    } catch (err) {
      setSheet(null);
      setSheetError(err.response?.data?.message || "تعذّر تحميل الكشف.");
    } finally {
      setSheetLoading(false);
    }
  }, [classId, subjectId, sheetKey]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  useEffect(() => {
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ classId, subjectId }));
    } catch {
      /* the choice just isn't remembered */
    }
  }, [classId, subjectId]);

  const pickClass = (id) => {
    if (!confirmLeave()) return;
    setClassId(id);
    const cls = options.classes.find((c) => c._id === id);
    // Keep the subject when the new class has it too — the usual way through
    // a pile of one teacher's registers is class after class.
    setSubjectId(cls?.subjects.some((s) => s._id === subjectId) ? subjectId : "");
    if (sheetKey.startsWith("test") && !cls?.terms) setSheetKey(`week:${options.weeks[0]?.weekStart}`);
  };
  const pickSubject = (id) => {
    if (!confirmLeave()) return;
    setSubjectId(id);
  };
  const pickSheet = (key) => {
    if (!confirmLeave()) return;
    setSheetKey(key);
  };

  // Fill every empty cell of a column with its full mark — the usual case
  // for مواظبة وسلوك — leaving whatever is already there alone.
  const fillEmpty = (column) => {
    setTyped((prev) => {
      const next = { ...prev };
      for (const student of sheet.students) {
        const key = `${student._id}:${column.key}`;
        const current = key in next ? toLatin(next[key]) : shownAs(student.marks[column.key]);
        if (current === "") next[key] = String(column.max);
      }
      return next;
    });
  };

  // Enter or ↓ goes down the column, ↑ back up — copying a paper column.
  const onKeyDown = (e, rowIndex, columnKey) => {
    const step = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const target = sheet.students[rowIndex + step];
    if (target) inputs.current[`${target._id}:${columnKey}`]?.focus();
  };

  const save = async () => {
    if (!changes.length || invalidCount) return;
    setSaving(true);
    setSaveError("");
    setSaved("");
    try {
      const byStudent = new Map();
      for (const c of changes) {
        if (!byStudent.has(c.student)) byStudent.set(c.student, {});
        byStudent.get(c.student)[c.column] = c.value;
      }
      const list = [...byStudent].map(([student, marks]) => ({ student, marks }));
      const [kind, a, b] = sheetKey.split(":");
      const res =
        kind === "week"
          ? await API.put("/admin-marks/week", { classroom: classId, subject: subjectId, weekStart: a, list })
          : await API.put("/admin-marks/test", { classroom: classId, subject: subjectId, term: Number(a), testNo: Number(b), list });
      await loadSheet();
      setSaved(res.data?.message || "اتحفظت الدرجات.");
    } catch (err) {
      setSaveError(err.response?.data?.message || "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  };

  const valueOf = (student, column) => {
    const key = `${student._id}:${column.key}`;
    return key in typed ? typed[key] : shownAs(student.marks[column.key]);
  };
  const rowTotal = (student) => {
    let sum = 0;
    let any = false;
    for (const column of sheet.columns) {
      const text = toLatin(valueOf(student, column));
      if (text !== "" && Number.isFinite(Number(text))) {
        sum += Number(text);
        any = true;
      }
    }
    return any ? Math.round(sum * 100) / 100 : "";
  };

  const sheetLabel = (() => {
    if (!sheetKey || !options) return "";
    const [kind, a, b] = sheetKey.split(":");
    if (kind === "week") return options.weeks.find((w) => w.weekStart === a)?.label || "";
    return `الاختبار ${b === "1" ? "الأول" : "الثاني"} — الترم ${a === "1" ? "الأول" : "الثاني"}`;
  })();


  // Everything on this page reads at a glance: dark borders, near-black
  // text, big numbers — the people using it are copying paper registers,
  // not exploring software. A read-only view stays just as readable.
  const selectClass =
    "w-full p-4 bg-white rounded-2xl border-2 border-slate-500 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-100 outline-none font-black text-slate-900 text-lg transition-all disabled:bg-slate-100 disabled:text-slate-700 disabled:border-slate-400";

  const stepBadge = "w-8 h-8 rounded-full bg-indigo-700 text-white grid place-items-center text-base font-black";

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100 p-8" dir="rtl">
        <div className="max-w-3xl mx-auto p-6 bg-rose-50 border-2 border-rose-500 rounded-3xl text-rose-800 font-black flex items-center gap-2">
          <AlertCircle size={20} /> {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8 pb-36 font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <PenLine className="text-indigo-700" size={34} /> رصد الدرجات
          </h1>
          <p className="text-slate-800 font-bold text-base mt-2 leading-relaxed">
            اختار الفصل والمادة والأسبوع، واكتب الدرجات زي الكشف الورقي بالظبط، وبعدين دوس «حفظ الدرجات». الدرجات بتظهر عند المعلم كأنه هو اللي رصدها.
          </p>
        </div>

        {!canEdit && (
          <div className="p-4 bg-amber-100 border-2 border-amber-500 rounded-2xl text-amber-950 font-black text-base">
            حسابك بيتابع الدرجات بس ومينفعش يعدّلها. الرصد بيتعمل من حساب مدير المرحلة.
          </div>
        )}

        {!options ? (
          <div className="py-32 flex justify-center">
            <Loader2 className="animate-spin text-indigo-700" size={44} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="space-y-2 block">
                <span className="flex items-center gap-2 text-base font-black text-slate-900">
                  <span className={stepBadge}>1</span>
                  الفصل
                </span>
                <select className={selectClass} value={classId} onChange={(e) => pickClass(e.target.value)}>
                  <option value="">اختار الفصل…</option>
                  {options.classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.grade?.name ? `${c.grade.name} — ` : ""}
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 block">
                <span className="flex items-center gap-2 text-base font-black text-slate-900">
                  <span className={stepBadge}>2</span>
                  المادة
                </span>
                <select
                  className={selectClass}
                  value={subjectId}
                  disabled={!currentClass}
                  onChange={(e) => pickSubject(e.target.value)}
                >
                  <option value="">{currentClass ? "اختار المادة…" : "اختار الفصل الأول"}</option>
                  {currentClass?.subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} — أ. {s.teacher}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 block">
                <span className="flex items-center gap-2 text-base font-black text-slate-900">
                  <span className={stepBadge}>3</span>
                  الأسبوع أو الاختبار
                </span>
                <select className={selectClass} value={sheetKey} onChange={(e) => pickSheet(e.target.value)}>
                  <optgroup label="درجات الأسبوع">
                    {options.weeks.map((w) => (
                      <option key={w.weekStart} value={`week:${w.weekStart}`}>
                        {w.label} ({fmtDay(w.from)} – {fmtDay(w.to)})
                      </option>
                    ))}
                  </optgroup>
                  {(!currentClass || currentClass.terms) && (
                    <optgroup label="اختبارات الترم (من 15)">
                      {[1, 2].map((term) =>
                        [1, 2].map((testNo) => (
                          <option key={`${term}${testNo}`} value={`test:${term}:${testNo}`}>
                            الترم {term === 1 ? "الأول" : "الثاني"} — الاختبار {testNo === 1 ? "الأول" : "الثاني"}
                          </option>
                        )),
                      )}
                    </optgroup>
                  )}
                </select>
              </label>
            </div>

            {currentClass && currentClass.subjects.length === 0 && (
              <p className="p-4 bg-amber-100 border-2 border-amber-500 rounded-2xl text-amber-950 font-black text-base">
                الفصل ده مافيهوش مواد متسندة لمعلمين. اسندها من «إسناد الفصول» الأول.
              </p>
            )}

            {!classId || !subjectId ? (
              <div className="bg-white rounded-[2rem] border-2 border-slate-300 py-24 text-center text-slate-800 text-lg font-black">
                اختار الفصل والمادة علشان يظهر الكشف.
              </div>
            ) : sheetLoading ? (
              <div className="py-24 flex justify-center">
                <Loader2 className="animate-spin text-indigo-700" size={40} />
              </div>
            ) : sheetError ? (
              <div className="p-5 bg-rose-50 border-2 border-rose-500 rounded-2xl text-rose-800 font-black flex items-center gap-2">
                <AlertCircle size={20} /> {sheetError}
              </div>
            ) : sheet ? (
              <div className="bg-white rounded-[2rem] border-2 border-slate-300 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b-2 border-slate-300 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-black text-slate-900">
                    {currentSubject?.name} — {currentClass?.grade?.name} {currentClass?.name}
                    <span className="text-indigo-700"> · {sheetLabel}</span>
                  </h2>
                  <span className="text-base font-black text-slate-800">{sheet.students.length} طالب</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[680px]">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="w-14 p-3 text-base font-black border border-slate-600">م</th>
                        <th className="p-3 text-right text-base font-black border border-slate-600">اسم الطالب</th>
                        {sheet.columns.map((column) => (
                          <th key={column.key} className="p-3 text-base font-black border border-slate-600 w-44">
                            <div>{column.label}</div>
                            <div className="text-sm font-bold text-amber-300">من {column.max}</div>
                            {/* A week's columns only: a test has no mark most pupils simply get. */}
                            {canEdit && sheetKey.startsWith("week") && (
                              <button
                                type="button"
                                onClick={() => fillEmpty(column)}
                                className="mt-2 inline-flex items-center gap-1 text-sm font-black bg-white text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg"
                                title="بيكتب الدرجة النهائية في الخانات الفاضية بس"
                              >
                                <Wand2 size={14} /> كمّل الفاضي بـ {column.max}
                              </button>
                            )}
                          </th>
                        ))}
                        {sheet.total && (
                          <th className="p-3 text-base font-black border border-slate-600 w-32">
                            المجموع
                            <div className="text-sm font-bold text-amber-300">من {sheet.total}</div>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.students.map((student, rowIndex) => (
                        <tr key={student._id} className="odd:bg-white even:bg-slate-50">
                          <td className="p-2 text-center text-base font-black text-slate-900 border border-slate-300">
                            {rowIndex + 1}
                          </td>
                          <td className="p-2 px-3 text-base font-black text-slate-900 border border-slate-300">{student.name}</td>
                          {sheet.columns.map((column) => {
                            const key = `${student._id}:${column.key}`;
                            const change = changes.find((c) => c.key === key);
                            return (
                              <td key={column.key} className="p-2 border border-slate-300 text-center">
                                <input
                                  ref={(el) => {
                                    inputs.current[key] = el;
                                  }}
                                  value={valueOf(student, column)}
                                  readOnly={!canEdit}
                                  inputMode="decimal"
                                  dir="ltr"
                                  aria-label={`${column.label} — ${student.name}`}
                                  onChange={(e) => setTyped((prev) => ({ ...prev, [key]: e.target.value }))}
                                  onKeyDown={(e) => onKeyDown(e, rowIndex, column.key)}
                                  onFocus={(e) => e.target.select()}
                                  className={`w-28 h-14 text-center text-2xl font-black rounded-xl border-2 outline-none transition-all focus:ring-4 ${
                                    change?.invalid
                                      ? "border-rose-600 bg-rose-50 text-rose-700 focus:ring-rose-100"
                                      : change
                                        ? "border-amber-500 bg-amber-50 text-slate-900 focus:ring-amber-100"
                                        : canEdit
                                          ? "border-slate-500 bg-white text-slate-900 focus:border-indigo-700 focus:ring-indigo-100"
                                          : "border-slate-400 bg-slate-50 text-slate-900 focus:ring-slate-100"
                                  }`}
                                />
                              </td>
                            );
                          })}
                          {sheet.total && (
                            <td className="p-2 border border-slate-300 text-center text-2xl font-black text-indigo-800">
                              {rowTotal(student)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sheet.students.length === 0 && (
                  <p className="p-10 text-center text-slate-800 text-lg font-black">الفصل ده مافيهوش طلاب.</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {sheet && canEdit && (
        <div className="fixed bottom-0 left-0 right-0 lg:right-72 bg-white border-t-2 border-slate-300 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] px-6 py-4 z-40">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="text-base font-black">
              {invalidCount > 0 ? (
                <span className="text-rose-700 flex items-center gap-1.5">
                  <AlertCircle size={20} /> فيه {invalidCount} درجة أكبر من الدرجة النهائية أو مش رقم — صحّح اللي باللون الأحمر.
                </span>
              ) : saved && changes.length === 0 ? (
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 size={20} /> {saved}
                </span>
              ) : saveError ? (
                <span className="text-rose-700 flex items-center gap-1.5">
                  <AlertCircle size={20} /> {saveError}
                </span>
              ) : changes.length > 0 ? (
                <span className="text-amber-800">اتغيّرت درجات {changedStudents} طالب ولسه ماتحفظتش.</span>
              ) : (
                <span className="text-slate-800">اكتب الدرجات في الخانات، و«Enter» بينزلك للطالب اللي بعده.</span>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={saving || changes.length === 0 || invalidCount > 0}
              className="px-10 py-4 rounded-2xl font-black text-lg flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100 disabled:bg-slate-300 disabled:text-slate-800 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {changes.length === 0 && !saving ? "مفيش تغييرات تتحفظ" : "حفظ الدرجات"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMarks;
