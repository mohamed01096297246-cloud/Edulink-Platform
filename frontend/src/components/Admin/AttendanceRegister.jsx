import React, { useEffect, useMemo, useState } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import {
  ClipboardList,
  ChevronRight,
  ChevronLeft,
  Printer,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  UserX,
  Pencil,
  Save,
  X,
} from "lucide-react";

// سجل الحضور: the school's register for any day, class by class — who was
// present, absent or late, who took each class's register, and which
// classes never took one. Filters narrow it (grade, class, status) and the
// print button prints exactly what is on screen, each class on its own page.
//
// The administration can also take or correct a class's register here, for
// any past day — the teachers' window closes with the school day, and a
// missed or wrong register is the administration's to put right. One class
// is edited at a time; every change is recorded as the administration's.
// Backend: GET / PUT /attendance/register.

const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (key, days) => {
  const [y, m, d] = key.split("-").map(Number);
  return toKey(new Date(y, m - 1, d + days));
};
const longDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ar-EG-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const STATUS = {
  present: { label: "حاضر", cls: "bg-emerald-50 text-emerald-700" },
  absent: { label: "غائب", cls: "bg-rose-50 text-rose-700" },
  late: { label: "متأخر", cls: "bg-amber-50 text-amber-700" },
  none: { label: "لم يُسجَّل", cls: "bg-slate-100 text-slate-500" },
};

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "absent", label: "الغياب فقط" },
  { key: "present", label: "الحضور فقط" },
  { key: "late", label: "المتأخرين" },
];

const AttendanceRegister = () => {
  const { canEdit } = useAdminScope();
  const [date, setDate] = useState(toKey(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [grade, setGrade] = useState("");
  const [classroom, setClassroom] = useState("");
  const [status, setStatus] = useState("all");

  // The class being taken or corrected, and each student's status in it.
  const [editing, setEditing] = useState(null); // { classroomId, draft: { [id]: { status, excused } } }
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok" | "err", text }
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setEditing(null);
    API.get("/attendance/register", { params: { date } })
      .then((res) => {
        if (!cancelled) setData(res.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "تعذّر تحميل سجل الحضور");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  // A class nobody took starts with everyone present — the usual day, so the
  // administration only marks who was missing.
  const startEdit = (c) => {
    const draft = {};
    c.students.forEach((s) => {
      draft[s._id] = { status: s.status || "present", excused: s.excused === true };
    });
    setEditing({ classroomId: c.classroomId, draft });
    setNotice(null);
  };

  const setRow = (studentId, patch) =>
    setEditing((prev) => ({
      ...prev,
      draft: { ...prev.draft, [studentId]: { ...prev.draft[studentId], ...patch } },
    }));

  const changesIn = (c) =>
    c.students.filter((s) => {
      const d = editing?.draft[s._id];
      return d && (d.status !== s.status || (d.status === "absent" && d.excused !== (s.excused === true)));
    }).length;

  const saveEdit = async (c) => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await API.put("/attendance/register", {
        classroomId: c.classroomId,
        date,
        students: Object.entries(editing.draft).map(([student, d]) => ({
          student,
          status: d.status,
          excused: d.status === "absent" && d.excused,
        })),
      });
      setNotice({ type: "ok", text: `${c.grade} ${c.classroom}: ${res.data?.message || "اتحفظ"}` });
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setNotice({ type: "err", text: err.response?.data?.message || "تعذّر حفظ السجل" });
    } finally {
      setSaving(false);
    }
  };

  const grades = useMemo(
    () => [...new Set((data?.classes || []).map((c) => c.grade))].filter(Boolean),
    [data],
  );
  const classOptions = (data?.classes || []).filter((c) => !grade || c.grade === grade);

  const shownClasses = (data?.classes || [])
    .filter((c) => (!grade || c.grade === grade) && (!classroom || String(c.classroomId) === classroom))
    .map((c) => ({
      ...c,
      rows: c.students.filter((s) => status === "all" || s.status === status),
    }))
    // With a status filter, a class with nobody in it has nothing to print.
    .filter((c) => status === "all" || c.rows.length > 0);

  const totals = shownClasses.reduce(
    (t, c) => {
      Object.keys(t).forEach((k) => {
        t[k] += c.counts[k] || 0;
      });
      return t;
    },
    { students: 0, present: 0, absent: 0, late: 0, unrecorded: 0 },
  );
  const notTaken = shownClasses.filter((c) => !c.taken);
  const isToday = date === toKey(new Date());
  const filterLabel = FILTERS.find((f) => f.key === status)?.label;

  return (
    <div className="p-4 lg:p-8 bg-[#F8FAFC] min-h-screen" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 no-print">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <ClipboardList size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">سجل الحضور</h1>
              <p className="text-slate-400 font-medium text-sm">
                حضور وغياب الطلاب لأي يوم — فصل فصل، مع الطباعة
              </p>
            </div>
          </div>

          <button
            onClick={() => window.print()}
            disabled={loading || shownClasses.length === 0}
            className="bg-slate-900 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all disabled:opacity-40"
          >
            <Printer size={18} /> طباعة {status === "all" ? "السجل" : filterLabel}
          </button>
        </div>

        {/* The day */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 mb-4 flex flex-col md:flex-row md:items-center gap-3 no-print">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(shift(date, -1))}
              className="p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-600"
              title="اليوم اللي قبله"
            >
              <ChevronRight size={18} />
            </button>
            <input
              type="date"
              value={date}
              max={toKey(new Date())}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold text-slate-700 outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => setDate(shift(date, 1))}
              disabled={isToday}
              className="p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-600 disabled:opacity-30"
              title="اليوم اللي بعده"
            >
              <ChevronLeft size={18} />
            </button>
            {!isToday && (
              <button
                onClick={() => setDate(toKey(new Date()))}
                className="px-3 py-2 rounded-xl text-xs font-black text-indigo-600 hover:bg-indigo-50"
              >
                النهارده
              </button>
            )}
          </div>
          <span className="font-black text-slate-700 md:mr-2">{longDate(date)}</span>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center gap-3 no-print">
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setClassroom("");
            }}
            className="p-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold text-slate-700 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">كل المراحل</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={classroom}
            onChange={(e) => setClassroom(e.target.value)}
            className="p-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold text-slate-700 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">كل الفصول</option>
            {classOptions.map((c) => (
              <option key={c.classroomId} value={String(c.classroomId)}>
                {grade ? c.classroom : `${c.grade} — ${c.classroom}`}
              </option>
            ))}
          </select>
          <div className="flex bg-slate-50 rounded-xl p-1 md:mr-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${
                  status === f.key ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-indigo-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 flex justify-center py-32">
            <Loader2 className="animate-spin text-indigo-500" size={40} />
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-3xl p-6 font-bold">{error}</div>
        ) : (
          <div className="print-area">
            {/* Only on paper: which day and what this sheet lists. */}
            <div className="hidden print:block mb-4">
              <h2 className="text-2xl font-black">سجل الحضور — {longDate(date)}</h2>
              <p className="text-sm font-bold">
                {[grade || "كل المراحل", classroom ? classOptions.find((c) => String(c.classroomId) === classroom)?.classroom : "", filterLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: "الطلاب", value: totals.students, icon: <ClipboardList size={16} />, cls: "text-slate-700" },
                { label: "حاضر", value: totals.present, icon: <CheckCircle2 size={16} />, cls: "text-emerald-600" },
                { label: "غائب", value: totals.absent, icon: <XCircle size={16} />, cls: "text-rose-600" },
                { label: "متأخر", value: totals.late, icon: <Clock size={16} />, cls: "text-amber-600" },
                { label: "لم يُسجَّل", value: totals.unrecorded, icon: <UserX size={16} />, cls: "text-slate-500" },
              ].map((t) => (
                <div key={t.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <div className={`flex items-center gap-1.5 text-xs font-black ${t.cls}`}>
                    {t.icon} {t.label}
                  </div>
                  <div className={`text-2xl font-black mt-1 ${t.cls}`}>{t.value}</div>
                </div>
              ))}
            </div>

            {notTaken.length > 0 && status === "all" && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div className="text-sm font-bold text-amber-800">
                  فصول ما اتاخدش فيها الغياب اليوم ده ({notTaken.length}):{" "}
                  {notTaken.map((c) => `${c.grade} ${c.classroom}`).join("، ")}
                </div>
              </div>
            )}

            {notice && (
              <div
                className={`rounded-2xl p-4 mb-6 text-sm font-bold no-print ${
                  notice.type === "ok"
                    ? "bg-emerald-50 border border-emerald-100 text-emerald-800"
                    : "bg-rose-50 border border-rose-100 text-rose-700"
                }`}
              >
                {notice.text}
              </div>
            )}

            {shownClasses.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center text-slate-400 font-bold">
                {status === "all" ? "مفيش فصول في الاختيار ده." : `مفيش طلاب ${filterLabel === "الكل" ? "" : `في "${filterLabel}"`} اليوم ده.`}
              </div>
            ) : (
              shownClasses.map((c, index) => {
                const isEditing = editing && String(editing.classroomId) === String(c.classroomId);
                // Editing shows the whole class whatever the status filter —
                // correcting half a register would be easy to get wrong.
                const rowsShown = isEditing ? c.students : c.rows;
                const changes = isEditing ? changesIn(c) : 0;
                return (
                <div
                  key={c.classroomId}
                  className={`bg-white rounded-3xl border shadow-sm mb-6 overflow-hidden class-sheet ${index > 0 ? "page-break" : ""} ${
                    isEditing ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-100"
                  }`}
                >
                  <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-black text-slate-800">
                        {c.grade} — {c.classroom}
                      </h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">
                        {c.taken
                          ? `سجّل الغياب: أ. ${c.takenBy || "—"}${c.takenAt ? ` · ${new Date(c.takenAt).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" })}` : ""}`
                          : "الغياب ما اتاخدش في الفصل ده اليوم ده"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">حاضر {c.counts.present}</span>
                      <span className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700">غائب {c.counts.absent}</span>
                      {c.counts.late > 0 && (
                        <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700">متأخر {c.counts.late}</span>
                      )}
                      <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">من {c.counts.students}</span>

                      {canEdit && !isEditing && c.students.length > 0 && (
                        <button
                          onClick={() => startEdit(c)}
                          disabled={Boolean(editing)}
                          className={`no-print flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 ${
                            c.taken
                              ? "bg-slate-900 text-white hover:bg-indigo-600"
                              : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                          title={editing ? "خلّص تعديل الفصل التاني الأول" : ""}
                        >
                          <Pencil size={13} /> {c.taken ? "تعديل" : "تسجيل الغياب"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="no-print px-5 py-3 bg-indigo-50/60 border-b border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <p className="text-xs font-bold text-indigo-800">
                        {c.taken
                          ? "غيّر حالة أي طالب واضغط حفظ — التعديل هيتسجّل باسم الإدارة."
                          : "كل الطلاب حاضرين مبدئيًا — علّم على الغايبين بس واضغط حفظ."}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditing(null)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
                        >
                          <X size={14} /> إلغاء
                        </button>
                        <button
                          onClick={() => saveEdit(c)}
                          disabled={saving || changes === 0}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
                        >
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          {changes === 0
                            ? "مفيش تغيير"
                            : c.taken
                              ? `حفظ ${changes} تعديل`
                              : `تسجيل غياب ${changes} طالب`}
                        </button>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-right">
                    <thead>
                      <tr className="bg-slate-50/60 border-b border-slate-100">
                        <th className="p-3 w-12 text-[11px] font-black text-slate-400">م</th>
                        <th className="p-3 text-[11px] font-black text-slate-400">الطالب</th>
                        <th className="p-3 text-[11px] font-black text-slate-400">الحالة</th>
                        <th className="p-3 text-[11px] font-black text-slate-400">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rowsShown.map((s, i) => {
                        const st = STATUS[s.status] || STATUS.none;
                        const notes = [
                          s.status === "absent" ? (s.excused ? "بعذر" : "بدون عذر") : "",
                          s.addedBy ? `أضافه أ. ${s.addedBy} بعد الحصة الأولى` : "",
                          s.editedBy ? `عدّلته الإدارة (${s.editedBy})` : "",
                          s.lessons > 1 && s.absentLessons > 0 && s.absentLessons < s.lessons
                            ? `غاب ${s.absentLessons} من ${s.lessons} حصص`
                            : "",
                        ].filter(Boolean);
                        const d = isEditing ? editing.draft[s._id] : null;
                        return (
                          <tr key={s._id} className={d && d.status !== s.status ? "bg-indigo-50/40" : ""}>
                            <td className="p-3 text-xs font-bold text-slate-400">{i + 1}</td>
                            <td className="p-3 text-sm font-bold text-slate-700">{s.name}</td>
                            <td className="p-3">
                              {d ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {["present", "absent", "late"].map((key) => (
                                    <button
                                      key={key}
                                      onClick={() => setRow(s._id, { status: key })}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                                        d.status === key
                                          ? `${STATUS[key].cls} border-current`
                                          : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                                      }`}
                                    >
                                      {STATUS[key].label}
                                    </button>
                                  ))}
                                  {d.status === "absent" && (
                                    <label className="flex items-center gap-1 text-xs font-bold text-slate-600 mr-1 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={d.excused}
                                        onChange={(e) => setRow(s._id, { excused: e.target.checked })}
                                        className="accent-indigo-600"
                                      />
                                      بعذر
                                    </label>
                                  )}
                                </div>
                              ) : (
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${st.cls}`}>{st.label}</span>
                              )}
                            </td>
                            <td className="p-3 text-xs font-bold text-slate-500">{notes.join(" · ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area { position: absolute; inset: 0 auto auto 0; width: 100%; }
          .no-print { display: none !important; }
          aside, nav { display: none !important; }
          .class-sheet { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
          .page-break { break-before: page; page-break-before: always; }
          body { background: white; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `,
        }}
      />
    </div>
  );
};

export default AttendanceRegister;
