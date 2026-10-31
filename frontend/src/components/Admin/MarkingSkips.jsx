import React, { useCallback, useEffect, useState } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import { CircleMinus, Loader2, AlertCircle, CheckCircle2, Undo2, Check } from "lucide-react";

// رفع بند من الرصد: a teacher tells the school there was no تقييم أسبوعي (or
// كراسة الحصة, or any column of the week) in their subject this week, and
// the admin takes it off for the classes they choose — the week then counts
// only what is left, everywhere (backend controllers/markingSkipController.js).
// Nothing is deleted: marks already recorded under it count again when it is
// put back from the list below.
//
// For staff who don't use computers much, as «رصد الدرجات» is: the steps in
// the order the teacher's request comes in, everything chosen by tapping,
// and what the week will be out of said before anything is saved.

const fmtDay = (iso) => {
  const [, m, d] = String(iso).split("-");
  return `${Number(d)}/${Number(m)}`;
};

const weekName = (w) =>
  `${w.label} (${fmtDay(w.from)} – ${fmtDay(w.to)})${w.current ? " — الأسبوع ده" : w.next ? " — الأسبوع الجاي" : ""}`;

// «فصل واحد»، «فصلين»، «3 فصول»، «12 فصل».
const classesWord = (n) => (n === 1 ? "فصل واحد" : n === 2 ? "فصلين" : n <= 10 ? `${n} فصول` : `${n} فصل`);

const MarkingSkips = () => {
  const { canEdit } = useAdminScope();
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState(null);

  const [weekStart, setWeekStart] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classIds, setClassIds] = useState([]);
  const [columns, setColumns] = useState([]);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [busyRow, setBusyRow] = useState("");

  const loadList = useCallback(
    () =>
      API.get("/marking-skips")
        .then((res) => setItems(res.data?.data || []))
        .catch(() => setItems([])),
    [],
  );

  useEffect(() => {
    API.get("/marking-skips/options")
      .then((res) => {
        const data = res.data?.data;
        setOptions(data);
        setWeekStart((data.weeks.find((w) => w.current) || data.weeks[0])?.weekStart || "");
      })
      .catch((err) => setLoadError(err.response?.data?.message || "تعذّر تحميل المعلمين والفصول."));
    loadList();
  }, [loadList]);

  const week = options?.weeks.find((w) => w.weekStart === weekStart) || null;
  const teacher = options?.teachers.find((t) => String(t._id) === teacherId) || null;
  const subject = teacher?.subjects.find((s) => String(s._id) === subjectId) || null;
  const chosenClasses = subject ? subject.classes.filter((c) => classIds.includes(String(c._id))) : [];
  const schemesHere = [...new Set(chosenClasses.map((c) => c.scheme))];

  // The columns of the chosen classes' register — one list when they share
  // a scheme, the union when they don't (each class keeps only its own).
  const columnChoices = (() => {
    if (!options || !subject) return [];
    const seen = new Map();
    for (const scheme of schemesHere.length ? schemesHere : [...new Set(subject.classes.map((c) => c.scheme))]) {
      for (const column of options.schemes[scheme]?.columns || []) {
        if (!seen.has(column.key)) seen.set(column.key, { ...column, maxes: new Set() });
        seen.get(column.key).maxes.add(column.max);
      }
    }
    return [...seen.values()];
  })();

  // تقييم أسبوعي is off in every school in such a week already.
  const offEverywhere = (key) => key === "weeklyEvalScore" && week?.noWeeklyEval;
  // Already taken off this week in every class chosen.
  const offAlready = (key) =>
    chosenClasses.length > 0 &&
    chosenClasses.every((c) =>
      (items || []).some(
        (i) =>
          i.weekStart === weekStart &&
          String(i.subject._id) === subjectId &&
          String(i.classroom._id) === String(c._id) &&
          i.columns.some((col) => col.key === key),
      ),
    );

  const pickTeacher = (id) => {
    setTeacherId(id);
    const t = options.teachers.find((x) => String(x._id) === id);
    const only = t?.subjects.length === 1 ? t.subjects[0] : null;
    setSubjectId(only ? String(only._id) : "");
    setClassIds(only ? only.classes.map((c) => String(c._id)) : []);
    setColumns([]);
    setDone("");
    setError("");
  };

  const pickSubject = (id) => {
    setSubjectId(id);
    const s = teacher?.subjects.find((x) => String(x._id) === id);
    setClassIds(s ? s.classes.map((c) => String(c._id)) : []);
    setColumns([]);
    setDone("");
    setError("");
  };

  const toggle = (list, setList, id) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setDone("");
    setError("");
  };

  // What the week comes to in the chosen classes once the columns go.
  const outcome = schemesHere.map((scheme) => {
    const shape = options.schemes[scheme];
    const off = shape.columns.filter((c) => columns.includes(c.key) || offEverywhere(c.key) || offAlready(c.key));
    return {
      scheme,
      weekTotal: shape.weekTotal,
      outOf: shape.weekTotal - off.reduce((sum, c) => sum + c.max, 0),
      classes: chosenClasses.filter((c) => c.scheme === scheme).length,
    };
  });

  const labelsOf = (keys) =>
    keys.map((key) => `«${columnChoices.find((c) => c.key === key)?.label || key}»`).join(" و");

  const ready = week && subject && chosenClasses.length > 0 && columns.length > 0;

  const takeOff = async () => {
    if (!ready) return;
    const what = labelsOf(columns);
    const where = classesWord(chosenClasses.length);
    if (!window.confirm(`هترفع ${what} من ${subject.name} في ${where} — ${week.label}.\nالأسبوع هيتحسب على باقي البنود بس. متأكد؟`)) {
      return;
    }
    setSaving(true);
    setError("");
    setDone("");
    try {
      const res = await API.put("/marking-skips", {
        weekStart,
        subject: subjectId,
        classrooms: classIds,
        columns,
      });
      setDone(`${res.data?.message || "اترفع من الرصد."} (${week.label})`);
      setColumns([]);
      await loadList();
    } catch (err) {
      setError(err.response?.data?.message || "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  };

  const putBack = async (item, column) => {
    const name = column ? `«${column.label}»` : "البنود";
    if (
      !window.confirm(
        `هترجّع ${name} للرصد في ${item.subject.name} — ${item.classroom.grade} ${item.classroom.name} — ${item.week || fmtDay(item.weekStart)}.\nأي درجات اترصدت قبل كده في البند ده هترجع تتحسب. متأكد؟`,
      )
    ) {
      return;
    }
    setBusyRow(`${item._id}:${column?.key || ""}`);
    try {
      await API.delete(`/marking-skips/${item._id}`, { params: column ? { column: column.key } : {} });
      await loadList();
    } catch (err) {
      window.alert(err.response?.data?.message || "تعذّر الرجوع. جرّب تاني.");
    } finally {
      setBusyRow("");
    }
  };

  // Readable at a glance, as every page these staff use: dark borders,
  // near-black text, big targets.
  const selectClass =
    "w-full p-4 bg-white rounded-2xl border-2 border-slate-500 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-100 outline-none font-black text-slate-900 text-lg transition-all disabled:bg-slate-100 disabled:text-slate-800 disabled:border-slate-400";
  const stepBadge = "w-8 h-8 rounded-full bg-indigo-700 text-white grid place-items-center text-base font-black shrink-0";
  const chip = (on) =>
    `inline-flex items-center gap-2 px-4 py-3 rounded-2xl border-2 text-base font-black ${
      on ? "bg-indigo-700 border-indigo-700 text-white" : "bg-white border-slate-500 text-slate-900 hover:border-indigo-700"
    }`;

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
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <CircleMinus className="text-indigo-700" size={34} /> رفع بند من الرصد
          </h1>
          <p className="text-slate-800 font-bold text-base mt-2 leading-relaxed">
            لو معلم قالك إن مادته مالهاش تقييم أسبوعي (أو كراسة حصة، أو أي بند تاني) في أسبوع معين، ارفعه من هنا. الأسبوع
            هيتحسب على باقي البنود بس: عند المعلم، وولي الأمر، والطالب، وفي الكشوف ومتوسط الشهر.
          </p>
          <p className="text-slate-900 font-black text-base mt-2">
            الدرجات اللي اترصدت قبل كده في البند ده مش بتتمسح — ولو رجّعته من الجدول اللي تحت بترجع تتحسب.
          </p>
        </div>

        {!canEdit && (
          <div className="p-4 bg-amber-100 border-2 border-amber-500 rounded-2xl text-amber-950 font-black text-base">
            حسابك بيتابع بس ومينفعش يرفع بنود. الرفع بيتعمل من حساب مدير المرحلة.
          </div>
        )}

        {!options ? (
          <div className="py-32 flex justify-center">
            <Loader2 className="animate-spin text-indigo-700" size={44} />
          </div>
        ) : (
          canEdit && (
            <div className="bg-white rounded-[2rem] border-2 border-slate-300 shadow-sm p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-4">
                <label className="space-y-2 block">
                  <span className="flex items-center gap-2 text-base font-black text-slate-900">
                    <span className={stepBadge}>1</span>
                    الأسبوع
                  </span>
                  <select
                    className={selectClass}
                    value={weekStart}
                    onChange={(e) => {
                      setWeekStart(e.target.value);
                      setDone("");
                      setError("");
                    }}
                  >
                    {options.weeks.map((w) => (
                      <option key={w.weekStart} value={w.weekStart}>
                        {weekName(w)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 block">
                  <span className="flex items-center gap-2 text-base font-black text-slate-900">
                    <span className={stepBadge}>2</span>
                    المعلم
                  </span>
                  <select className={selectClass} value={teacherId} onChange={(e) => pickTeacher(e.target.value)}>
                    <option value="">اختار المعلم…</option>
                    {options.teachers.map((t) => (
                      <option key={t._id} value={String(t._id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 block">
                  <span className="flex items-center gap-2 text-base font-black text-slate-900">
                    <span className={stepBadge}>3</span>
                    المادة
                  </span>
                  <select
                    className={selectClass}
                    value={subjectId}
                    disabled={!teacher}
                    onChange={(e) => pickSubject(e.target.value)}
                  >
                    <option value="">{teacher ? "اختار المادة…" : "اختار المعلم الأول"}</option>
                    {teacher?.subjects.map((s) => (
                      <option key={s._id} value={String(s._id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {subject && (
                <>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-base font-black text-slate-900">
                        <span className={stepBadge}>4</span>
                        الفصول
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setClassIds(
                            classIds.length === subject.classes.length ? [] : subject.classes.map((c) => String(c._id)),
                          )
                        }
                        className="text-base font-black text-indigo-800 underline underline-offset-4"
                      >
                        {classIds.length === subject.classes.length ? "شيل الكل" : "كل الفصول"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {subject.classes.map((c) => {
                        const on = classIds.includes(String(c._id));
                        return (
                          <button
                            key={c._id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(classIds, setClassIds, String(c._id))}
                            className={chip(on)}
                          >
                            {on && <Check size={18} />}
                            {c.grade} — {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="flex items-center gap-2 text-base font-black text-slate-900">
                      <span className={stepBadge}>5</span>
                      البند اللي هيترفع
                    </span>
                    <div className="flex flex-wrap gap-3">
                      {columnChoices.map((c) => {
                        const everywhere = offEverywhere(c.key);
                        const already = !everywhere && offAlready(c.key);
                        const on = columns.includes(c.key);
                        return (
                          <button
                            key={c.key}
                            type="button"
                            aria-pressed={on}
                            disabled={everywhere || already}
                            onClick={() => toggle(columns, setColumns, c.key)}
                            className={`${chip(on)} disabled:bg-slate-100 disabled:border-slate-400 disabled:text-slate-800 disabled:cursor-not-allowed`}
                          >
                            {on && <Check size={18} />}
                            {c.label}
                            <span className={`text-sm font-bold ${on ? "text-white" : "text-slate-800"}`}>
                              {everywhere
                                ? "(مترفع في كل المدارس الأسبوع ده)"
                                : already
                                  ? "(مترفع بالفعل)"
                                  : `(من ${[...c.maxes].join(" / ")})`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {ready && (
                    <div className="p-4 rounded-2xl border-2 border-indigo-400 bg-indigo-50 text-indigo-950 font-black text-lg leading-relaxed">
                      {outcome.map((o) => (
                        <div key={o.scheme}>
                          {subject.name} في{" "}
                          {o.classes === 1 ? "الفصل ده" : o.classes === 2 ? "الفصلين دول" : `الـ ${classesWord(o.classes)} دول`} —{" "}
                          {week.label}:
                          الأسبوع هيتحسب من <span className="text-indigo-800 text-2xl">{o.outOf}</span> بدل {o.weekTotal}.
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-base font-black">
                      {error ? (
                        <span className="text-rose-700 flex items-center gap-1.5">
                          <AlertCircle size={20} /> {error}
                        </span>
                      ) : done ? (
                        <span className="text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 size={20} /> {done}
                        </span>
                      ) : !ready ? (
                        <span className="text-slate-800">
                          {chosenClasses.length === 0 ? "اختار فصل واحد على الأقل." : "اختار البند اللي هيترفع."}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={takeOff}
                      disabled={!ready || saving}
                      className="px-10 py-4 rounded-2xl font-black text-lg flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white disabled:bg-slate-300 disabled:text-slate-800 disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 className="animate-spin" size={20} /> : <CircleMinus size={20} />}
                      ارفع من الرصد
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        )}

        <div className="bg-white rounded-[2rem] border-2 border-slate-300 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b-2 border-slate-300 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-black text-slate-900">البنود المرفوعة</h2>
            {items && <span className="text-base font-black text-slate-800">{items.length} فصل</span>}
          </div>
          {!items ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="animate-spin text-indigo-700" size={32} />
            </div>
          ) : items.length === 0 ? (
            <p className="p-10 text-center text-slate-800 text-lg font-black">مفيش بنود مرفوعة لحد دلوقتي.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="p-3 text-right text-base font-black border border-slate-600">الأسبوع</th>
                    <th className="p-3 text-right text-base font-black border border-slate-600">الفصل</th>
                    <th className="p-3 text-right text-base font-black border border-slate-600">المادة والمعلم</th>
                    <th className="p-3 text-right text-base font-black border border-slate-600">البنود المرفوعة</th>
                    <th className="p-3 text-base font-black border border-slate-600 w-32">الأسبوع بقى من</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id} className="odd:bg-white even:bg-slate-50 align-top">
                      <td className="p-3 border border-slate-300 text-base font-black text-slate-900 whitespace-nowrap">
                        {item.week || "—"}
                        <div className="text-sm font-bold text-slate-800">من {fmtDay(item.weekStart)}</div>
                      </td>
                      <td className="p-3 border border-slate-300 text-base font-black text-slate-900">
                        {item.classroom.grade} — {item.classroom.name}
                      </td>
                      <td className="p-3 border border-slate-300 text-base font-black text-slate-900">
                        {item.subject.name}
                        {item.teacher && <div className="text-sm font-bold text-slate-800">أ. {item.teacher}</div>}
                      </td>
                      <td className="p-3 border border-slate-300">
                        <div className="flex flex-wrap gap-2">
                          {item.columns.map((c) => (
                            <span
                              key={c.key}
                              className="inline-flex items-center gap-2 pr-3 pl-1.5 py-1.5 rounded-xl border-2 border-rose-400 bg-rose-50 text-rose-900 text-base font-black"
                            >
                              {c.label}
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => putBack(item, c)}
                                  disabled={busyRow === `${item._id}:${c.key}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border-2 border-slate-500 text-slate-900 text-sm font-black hover:border-indigo-700 disabled:opacity-70"
                                  title="يرجّع البند ده للرصد في الفصل ده والأسبوع ده"
                                >
                                  {busyRow === `${item._id}:${c.key}` ? (
                                    <Loader2 className="animate-spin" size={14} />
                                  ) : (
                                    <Undo2 size={14} />
                                  )}
                                  رجّعه
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        {item.by && <div className="mt-2 text-sm font-bold text-slate-800">رفعه: {item.by}</div>}
                      </td>
                      <td className="p-3 border border-slate-300 text-center text-2xl font-black text-indigo-800">
                        {item.outOf}
                        <div className="text-sm font-bold text-slate-800">بدل {item.weekTotal}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarkingSkips;
