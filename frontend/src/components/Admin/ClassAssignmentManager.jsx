import React, { useEffect, useMemo, useState } from "react";
import API from "../../api/axios";
import useAdminScope from "../../hooks/useAdminScope";
import {
  Link2,
  Loader2,
  Save,
  Search,
  Users,
  LayoutGrid,
  CheckCircle2,
  XCircle,
  X,
  BookOpen,
} from "lucide-react";

// إسناد الفصول: كل معلم بيدرّس أنهي مادة لأنهي فصل — بيتحدد هنا الأول، قبل
// الجدول الدراسي. المعلم بيشوف فصوله في التطبيق من هنا حتى لو الجدول لسه
// متعملش، ولما تبني الجدول بعد كده المادة بتجيب معلمها المسند لوحدها.
// (backend: models/ClassAssignment.js)
const ClassAssignmentManager = () => {
  const { canEdit } = useAdminScope();
  const [teachers, setTeachers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [tab, setTab] = useState("teacher");
  const [query, setQuery] = useState("");
  const [teacherId, setTeacherId] = useState("");
  // "classroomId:subjectId" for everything ticked for the selected teacher.
  const [draft, setDraft] = useState(new Set());
  const [overviewGrade, setOverviewGrade] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [t, c, s, a] = await Promise.all([
        API.get("/teacher"),
        API.get("/classrooms"),
        API.get("/subjects"),
        API.get("/class-assignments"),
      ]);
      setTeachers(t.data.data || []);
      setClassrooms(Array.isArray(c.data) ? c.data : []);
      setSubjects(Array.isArray(s.data) ? s.data : []);
      setAssignments(a.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر تحميل البيانات", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const keyOf = (classroomId, subjectId) => `${classroomId}:${subjectId}`;

  // Who holds each (class, subject) right now.
  const holder = useMemo(() => {
    const map = new Map();
    assignments.forEach((a) => {
      if (a.classroom?._id && a.subject?._id) map.set(keyOf(a.classroom._id, a.subject._id), a.teacher);
    });
    return map;
  }, [assignments]);

  const countFor = (id) => assignments.filter((a) => a.teacher?._id === id).length;

  const selectTeacher = (id) => {
    setTeacherId(id);
    setDraft(
      new Set(
        assignments
          .filter((a) => a.teacher?._id === id && a.classroom?._id && a.subject?._id)
          .map((a) => keyOf(a.classroom._id, a.subject._id)),
      ),
    );
  };

  const teacher = teachers.find((t) => t._id === teacherId);

  const grades = useMemo(
    () =>
      Array.from(
        new Map(classrooms.filter((c) => c.grade?._id).map((c) => [c.grade._id, c.grade])).values(),
      ),
    [classrooms],
  );

  const classroomsOf = (gradeId) =>
    classrooms
      .filter((c) => c.grade?._id === gradeId)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const subjectCovers = (subject, gradeId) =>
    subject.allGrades || (subject.grades || []).some((g) => (g._id || g) === gradeId);

  // The teacher's subjects carry only name/code, so read the grades each
  // is taught to off the full subject list.
  const teacherSubjects = (teacher?.subjects || [])
    .map((s) => subjects.find((full) => full._id === (s._id || s)))
    .filter(Boolean);

  const toggle = (classroomId, subjectId) => {
    setDraft((prev) => {
      const next = new Set(prev);
      const key = keyOf(classroomId, subjectId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGrade = (gradeId, subjectId) => {
    const free = classroomsOf(gradeId).filter((c) => {
      const h = holder.get(keyOf(c._id, subjectId));
      return !h || h._id === teacherId;
    });
    const allOn = free.every((c) => draft.has(keyOf(c._id, subjectId)));
    setDraft((prev) => {
      const next = new Set(prev);
      free.forEach((c) => {
        const key = keyOf(c._id, subjectId);
        if (allOn) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const list = [...draft].map((key) => {
        const [classroom, subject] = key.split(":");
        return { classroom, subject };
      });
      const res = await API.put(`/class-assignments/teacher/${teacherId}`, { assignments: list });
      showToast(res.data?.message || "تم الحفظ");
      const a = await API.get("/class-assignments");
      setAssignments(a.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || "تعذّر الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const savedKeys = useMemo(
    () =>
      new Set(
        assignments
          .filter((a) => a.teacher?._id === teacherId && a.classroom?._id && a.subject?._id)
          .map((a) => keyOf(a.classroom._id, a.subject._id)),
      ),
    [assignments, teacherId],
  );
  const dirty = savedKeys.size !== draft.size || [...draft].some((k) => !savedKeys.has(k));

  const filteredTeachers = teachers
    .filter((t) => `${t.firstName} ${t.lastName}`.includes(query.trim()))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "ar"));

  // ---- by class overview ----
  const overviewSubjects = subjects
    .filter((s) => overviewGrade && subjectCovers(s, overviewGrade))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const overviewRooms = overviewGrade ? classroomsOf(overviewGrade) : [];
  const missing = overviewRooms.reduce(
    (n, c) => n + overviewSubjects.filter((s) => !holder.get(keyOf(c._id, s._id))).length,
    0,
  );

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen" dir="rtl">
      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border text-sm font-bold max-w-xl ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
          ) : (
            <XCircle className="text-rose-500 shrink-0" size={20} />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="mr-2 p-1 hover:bg-black/5 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <Link2 size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">إسناد الفصول</h1>
              <p className="text-slate-400 font-medium text-sm">
                حدد كل معلم بيدرّس أنهي فصول — قبل الجدول الدراسي. المعلم بيشوف فصوله في
                التطبيق على طول، والجدول بعد كده بياخد المعلم المسند لكل مادة.
              </p>
            </div>
          </div>

          <div className="flex bg-white border border-slate-100 rounded-2xl p-1 shadow-sm shrink-0">
            {[
              { key: "teacher", label: "حسب المعلم", icon: <Users size={16} /> },
              { key: "class", label: "حسب الفصل", icon: <LayoutGrid size={16} /> },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
                  tab === t.key ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-indigo-600"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-[2rem] border border-slate-100 flex justify-center py-40">
            <Loader2 className="animate-spin text-indigo-500" size={44} />
          </div>
        ) : tab === "teacher" ? (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* teachers list */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 space-y-3 lg:max-h-[75vh] lg:overflow-y-auto">
              <div className="relative">
                <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث باسم المعلم..."
                  className="w-full pr-10 pl-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-400 outline-none text-sm font-bold"
                />
              </div>
              {filteredTeachers.length === 0 && (
                <p className="text-center text-slate-400 text-sm font-bold py-8">مفيش معلمين.</p>
              )}
              {filteredTeachers.map((t) => {
                const n = countFor(t._id);
                const active = t._id === teacherId;
                return (
                  <button
                    key={t._id}
                    onClick={() => selectTeacher(t._id)}
                    className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all ${
                      active
                        ? "bg-indigo-50 border-indigo-300"
                        : "bg-white border-slate-50 hover:border-indigo-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-slate-700 text-sm truncate">
                        {t.firstName} {t.lastName}
                      </span>
                      <span
                        className={`text-[11px] font-black px-2 py-0.5 rounded-lg shrink-0 ${
                          n ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {n ? `${n} فصل` : "مفيش"}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">
                      {(t.subjects || []).map((s) => s.name).join("، ") || "بدون مادة"}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* the selected teacher's classes */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
              {!teacher ? (
                <div className="text-center text-slate-400 font-bold py-32">
                  اختار معلم من القائمة عشان تحدد فصوله.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black text-slate-800">
                        أ. {teacher.firstName} {teacher.lastName}
                      </h2>
                      <p className="text-xs font-bold text-slate-400 mt-1">
                        علّم على الفصول اللي بيدرّسها في كل مادة. الفصل المسند لمعلم تاني بيظهر باسمه.
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={save}
                        disabled={saving || !dirty}
                        className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        حفظ ({draft.size})
                      </button>
                    )}
                  </div>

                  {teacherSubjects.length === 0 && (
                    <p className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-sm font-bold">
                      المعلم ده ملوش مواد — ضيفله مادة من صفحة المعلمين الأول.
                    </p>
                  )}

                  {teacherSubjects.map((subject) => {
                    const subjectGrades = grades.filter((g) => subjectCovers(subject, g._id));
                    return (
                      <div key={subject._id} className="border border-slate-100 rounded-3xl p-5 space-y-4 bg-slate-50/40">
                        <div className="flex items-center gap-2 text-indigo-700">
                          <BookOpen size={18} />
                          <h3 className="font-black">{subject.name}</h3>
                        </div>
                        {subjectGrades.length === 0 && (
                          <p className="text-xs font-bold text-slate-400">المادة دي مش مربوطة بأي مرحلة.</p>
                        )}
                        {subjectGrades.map((grade) => (
                          <div key={grade._id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-black text-slate-600">{grade.name}</span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => toggleGrade(grade._id, subject._id)}
                                  className="text-[11px] font-black text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg"
                                >
                                  الكل / لا شيء
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {classroomsOf(grade._id).map((c) => {
                                const key = keyOf(c._id, subject._id);
                                const h = holder.get(key);
                                const other = h && h._id !== teacherId;
                                const on = draft.has(key);
                                return (
                                  <button
                                    key={c._id}
                                    type="button"
                                    disabled={other || !canEdit}
                                    onClick={() => toggle(c._id, subject._id)}
                                    title={other ? `مسند لأ. ${h.firstName} ${h.lastName}` : ""}
                                    className={`min-w-[88px] px-3 py-2 rounded-xl border-2 text-center transition-all ${
                                      other
                                        ? "bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed"
                                        : on
                                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                                          : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                                    }`}
                                  >
                                    <div className="text-sm font-black">{c.name}</div>
                                    {other && (
                                      <div className="text-[10px] font-bold truncate max-w-[110px]">
                                        أ. {h.firstName}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <select
                value={overviewGrade}
                onChange={(e) => setOverviewGrade(e.target.value)}
                className="w-full sm:w-80 p-3.5 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm"
              >
                <option value="">اختر المرحلة...</option>
                {grades.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {overviewGrade && (
                <span
                  className={`text-sm font-black px-4 py-2 rounded-xl ${
                    missing ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {missing ? `${missing} مادة في فصول لسه من غير معلم` : "كل المواد في كل الفصول ليها معلم"}
                </span>
              )}
            </div>

            {!overviewGrade ? (
              <div className="text-center text-slate-400 font-bold py-24">
                اختار مرحلة عشان تشوف مين بيدرّس إيه في كل فصل.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky right-0 bg-slate-100 text-slate-600 font-black px-4 py-3 text-right rounded-tr-xl">
                        الفصل
                      </th>
                      {overviewSubjects.map((s) => (
                        <th key={s._id} className="bg-slate-100 text-slate-600 font-black px-3 py-3 text-center whitespace-nowrap">
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overviewRooms.map((c) => (
                      <tr key={c._id}>
                        <td className="sticky right-0 bg-white font-black text-slate-700 px-4 py-3 border-b border-slate-100 whitespace-nowrap">
                          {c.name}
                        </td>
                        {overviewSubjects.map((s) => {
                          const h = holder.get(keyOf(c._id, s._id));
                          return (
                            <td key={s._id} className="px-2 py-2 border-b border-slate-100 text-center">
                              {h ? (
                                <button
                                  onClick={() => {
                                    setTab("teacher");
                                    selectTeacher(h._id);
                                  }}
                                  className="text-xs font-bold text-slate-700 bg-indigo-50/60 hover:bg-indigo-100 px-2 py-1.5 rounded-lg whitespace-nowrap"
                                >
                                  {h.firstName} {h.lastName}
                                </button>
                              ) : (
                                <span className="text-xs font-black text-amber-500">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassAssignmentManager;
