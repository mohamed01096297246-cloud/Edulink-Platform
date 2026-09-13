import React, { useState, useEffect } from "react";
import API from "../../api/axios";
import {
  Calendar,
  Clock,
  User,
  Home,
  Plus,
  Trash2,
  Edit,
  X,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle2,
  Filter,
  BookOpen,
  Layers,
} from "lucide-react";

const daysMapping = {
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
};
const dayOrder = Object.keys(daysMapping);

const SchedulesPage = () => {
  const [schedules, setSchedules] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // حالات الفلترة (الصف والفصل) لعرض الكروت
  const [selectedClassroom, setSelectedClassroom] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [deleteId, setDeleteId] = useState(null);

  // ---- منشئ جدول الفصل — الأساس هنا الفصل، مش المعلم ----
  // تختار المرحلة والفصل مرة واحدة، وبعدها تضيف كل حصص الفصل ده يوم بيوم
  // من غير ما تعيد اختيار الفصل تاني في كل مرة.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderGrade, setBuilderGrade] = useState("");
  const [builderClassroom, setBuilderClassroom] = useState("");
  const [addingDay, setAddingDay] = useState(null);
  const [editingPeriodId, setEditingPeriodId] = useState(null);
  const [periodForm, setPeriodForm] = useState({
    startTime: "",
    endTime: "",
    subjectId: "",
    teacherId: "",
  });
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodError, setPeriodError] = useState("");

  // ترتيب أيام الأسبوع زي JavaScript's Date.getDay() (0 = الأحد ... 6 = السبت)
  // الجمعة والسبت مش موجودين في daysMapping أصلًا (مفيش حصص فيهم)، فلو النهاردة
  // جمعة أو سبت هتفضل القيمة null ومفيش يوم هيتطابق معاها (يعني القائمة هتفضل فاضية،
  // وده صح لأنه مفيش حصص أصلًا في يوم إجازة).
  const jsDayToKey = ["sun", "mon", "tue", "wed", "thu", null, null];
  const todayKey = jsDayToKey[new Date().getDay()];

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 3000);
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [schRes, teachRes, classRes, subjRes] = await Promise.all([
        API.get("/schedules"),
        API.get("/teacher"),
        API.get("/classrooms"),
        API.get("/subjects"),
      ]);
      setSchedules(Array.isArray(schRes.data) ? schRes.data : []);
      setTeachers(teachRes.data.data || []);
      setClassrooms(Array.isArray(classRes.data) ? classRes.data : []);
      setSubjects(Array.isArray(subjRes.data) ? subjRes.data : []);
    } catch (err) {
      showToast("حدث خطأ أثناء تحميل البيانات", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await API.delete(`/schedules/${deleteId}`);
      showToast("تم حذف الحصة بنجاح", "success");
      fetchInitialData();
      setDeleteId(null);
    } catch (err) {
      showToast("فشل حذف الحصة", "error");
      setDeleteId(null);
    }
  };

  // تصفية الجداول بناءً على الفصل المختار وحصص اليوم فقط
  const filteredSchedules = schedules
    .filter((s) => !selectedClassroom || s.classroom?._id === selectedClassroom)
    .filter((s) => !todayOnly || s.day === todayKey);

  // ---- منطق منشئ الجدول ----

  // المراحل مُستخرجة من الفصول نفسها (كل فصل معاه grade populated) بدل ما
  // نجيب endpoint تاني للمراحل.
  const grades = Array.from(
    new Map(
      classrooms
        .filter((c) => c.grade?._id)
        .map((c) => [c.grade._id, c.grade]),
    ).values(),
  );

  const gradeClassrooms = classrooms.filter(
    (c) => c.grade?._id === builderGrade,
  );

  const currentClassroom = classrooms.find((c) => c._id === builderClassroom);

  // المواد اللي بتتدرّس للمرحلة دي بس — سواء محدّدة بالاسم أو "كل المراحل".
  const gradeSubjects = subjects.filter(
    (s) =>
      s.allGrades ||
      (s.grades || []).some((g) => (g._id || g) === builderGrade),
  );

  // المعلمين اللي بيدرّسوا المادة المختارة ومسموحلهم بالمرحلة دي.
  const eligibleTeachers = teachers.filter(
    (t) =>
      (t.subjects || []).some((s) => s._id === periodForm.subjectId) &&
      (t.teachingGrades || []).some((g) => g._id === builderGrade),
  );

  const classroomSchedules = schedules.filter(
    (s) => s.classroom?._id === builderClassroom,
  );

  const periodsForDay = (day) =>
    classroomSchedules
      .filter((s) => s.day === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const resetPeriodForm = () => {
    setPeriodForm({ startTime: "", endTime: "", subjectId: "", teacherId: "" });
    setPeriodError("");
    setEditingPeriodId(null);
  };

  const openBuilder = () => {
    setBuilderOpen(true);
    setBuilderGrade("");
    setBuilderClassroom("");
    setAddingDay(null);
    resetPeriodForm();
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setAddingDay(null);
    resetPeriodForm();
  };

  // "تعديل" على كارت حصة قائمة — يفتح المنشئ على نفس فصلها ومرحلتها، وياخد
  // بيانات الحصة دي في فورم الإضافة جاهزة للتعديل بدل الإضافة.
  const openBuilderForEdit = (schedule) => {
    setBuilderOpen(true);
    setBuilderGrade(schedule.classroom?.grade?._id || "");
    setBuilderClassroom(schedule.classroom?._id || "");
    setAddingDay(schedule.day);
    setEditingPeriodId(schedule._id);
    setPeriodForm({
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      subjectId: schedule.subject?._id || "",
      teacherId: schedule.teacher?._id || "",
    });
    setPeriodError("");
  };

  const startAddingPeriod = (day) => {
    setAddingDay(day);
    resetPeriodForm();
  };

  const handleSubjectChange = (subjectId) => {
    const teachersForSubject = teachers.filter(
      (t) =>
        (t.subjects || []).some((s) => s._id === subjectId) &&
        (t.teachingGrades || []).some((g) => g._id === builderGrade),
    );
    setPeriodForm((prev) => ({
      ...prev,
      subjectId,
      teacherId: teachersForSubject.length === 1 ? teachersForSubject[0]._id : "",
    }));
  };

  const handleSavePeriod = async (day) => {
    setPeriodError("");

    if (
      !periodForm.subjectId ||
      !periodForm.teacherId ||
      !periodForm.startTime ||
      !periodForm.endTime
    ) {
      setPeriodError("استكمل كل الحقول (المادة، المعلم، وقت البداية والنهاية).");
      return;
    }
    if (periodForm.endTime <= periodForm.startTime) {
      setPeriodError("وقت النهاية لازم يكون بعد وقت البداية.");
      return;
    }

    setPeriodSaving(true);
    try {
      const payload = {
        teacher: periodForm.teacherId,
        subjectId: periodForm.subjectId,
        classroom: builderClassroom,
        day,
        startTime: periodForm.startTime,
        endTime: periodForm.endTime,
      };

      if (editingPeriodId) {
        await API.put(`/schedules/${editingPeriodId}`, payload);
        showToast("تم تحديث الحصة بنجاح", "success");
      } else {
        await API.post("/schedules", payload);
        showToast("تمت إضافة الحصة بنجاح", "success");
      }

      setAddingDay(null);
      resetPeriodForm();
      fetchInitialData();
    } catch (err) {
      setPeriodError(err.response?.data?.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setPeriodSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" dir="rtl">
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-5 duration-300">
          <div
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={18} className="text-emerald-600" />
            ) : (
              <AlertCircle size={18} className="text-rose-600" />
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <Calendar className="text-indigo-600" size={36} /> الجدول الدراسي
            </h1>
            <p className="text-slate-400 font-medium text-sm mt-1">
              إدارة وفلترة جدول الحصص الدراسية
            </p>
          </div>
          <button
            onClick={openBuilder}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-100"
          >
            <Plus size={20} /> بناء جدول فصل
          </button>
        </div>

        {/* شريط الفلترة (Filter Bar) */}
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 font-bold text-sm bg-slate-50 px-4 py-3 rounded-2xl">
            <Filter size={16} className="text-indigo-500" />
            <span>فلترة حسب الفصل:</span>
          </div>
          <div className="w-full sm:w-72">
            <select
              className="w-full p-3.5 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm transition-all cursor-pointer"
              value={selectedClassroom}
              onChange={(e) => setSelectedClassroom(e.target.value)}
            >
              <option value="">كل الفصول والمراحل</option>
              {classrooms.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.grade?.name ? `${c.grade.name} - ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedClassroom && (
            <button
              onClick={() => setSelectedClassroom("")}
              className="text-xs font-bold text-rose-500 hover:bg-rose-50 px-3 py-2 rounded-xl transition-colors"
            >
              مسح الفلتر
            </button>
          )}

          <button
            onClick={() => setTodayOnly((prev) => !prev)}
            className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl font-black text-sm transition-all sm:mr-auto ${
              todayOnly
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
                : "bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
            }`}
          >
            <Calendar size={16} />
            {todayOnly ? `حصص اليوم (${daysMapping[todayKey] || "إجازة"})` : "حصص اليوم فقط"}
          </button>
        </div>

        {/* منطقة عرض البيانات (Cards Container) */}
        <div>
          {loading ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 flex justify-center py-40">
              <Loader2 className="animate-spin text-indigo-500" size={48} />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 text-center py-32 text-slate-400 font-bold uppercase tracking-wider">
              {todayOnly && !todayKey
                ? "النهاردة إجازة الأسبوع، مفيش حصص."
                : "لا يوجد جداول مطابقة لهذا الاختيار."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSchedules.map((s) => (
                <div
                  key={s._id}
                  className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  {/* شريط علوي صغير لتحديد اليوم ملوّن */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-500/10 group-hover:bg-indigo-500 transition-colors" />

                  <div className="space-y-4">
                    {/* معلومات اليوم والفصل */}
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl">
                        {daysMapping[s.day]}
                      </span>
                      <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl text-xs font-bold">
                        <Home size={14} className="text-slate-400" />
                        <span>
                          {s.classroom?.grade?.name} - {s.classroom?.name}
                        </span>
                      </div>
                    </div>

                    {/* المادة والـ Timing */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                          <BookOpen size={16} />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-800 text-base leading-tight">
                            {s.subject?.name || "لا توجد مادة محددة"}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
                            المادة
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                          <Clock size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            {s.startTime} - {s.endTime}
                          </p>
                          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
                            توقيت الحصة
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* المدرس */}
                    <div className="pt-3 border-t border-slate-50 flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-bold text-sm">
                        {s.teacher?.firstName?.charAt(0) || <User size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {s.teacher
                            ? `أ. ${s.teacher.firstName} ${s.teacher.lastName}`
                            : "معلم غير معروف"}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          المعلم
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* أزرار التحكم أسفل الكارد */}
                  <div className="flex gap-2 pt-5 mt-4 border-t border-slate-50/60">
                    <button
                      onClick={() => openBuilderForEdit(s)}
                      className="flex-1 py-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
                    >
                      <Edit size={14} /> تعديل
                    </button>
                    <button
                      onClick={() => setDeleteId(s._id)}
                      className="py-2.5 px-3 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all flex items-center justify-center text-xs font-bold"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- منشئ جدول الفصل ---- */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  بناء جدول فصل
                </h2>
                <p className="text-slate-400 text-xs font-bold mt-1">
                  اختار المرحلة والفصل، وبعدين ضيف حصصه يوم بيوم في مكان واحد.
                </p>
              </div>
              <button
                onClick={closeBuilder}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-6">
              {/* اختيار المرحلة والفصل */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 mr-2 uppercase flex items-center gap-1">
                    <Layers size={13} /> المرحلة
                  </label>
                  <select
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 transition-all"
                    value={builderGrade}
                    onChange={(e) => {
                      setBuilderGrade(e.target.value);
                      setBuilderClassroom("");
                      setAddingDay(null);
                      resetPeriodForm();
                    }}
                  >
                    <option value="">اختر المرحلة...</option>
                    {grades.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 mr-2 uppercase flex items-center gap-1">
                    <Home size={13} /> الفصل
                  </label>
                  <select
                    disabled={!builderGrade}
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    value={builderClassroom}
                    onChange={(e) => {
                      setBuilderClassroom(e.target.value);
                      setAddingDay(null);
                      resetPeriodForm();
                    }}
                  >
                    <option value="">
                      {builderGrade ? "اختر الفصل..." : "اختر المرحلة أولاً"}
                    </option>
                    {gradeClassrooms.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* جدول الأيام */}
              {builderClassroom && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <Calendar size={18} />
                    <h3 className="font-black text-sm">
                      جدول فصل {currentClassroom?.name} — {currentClassroom?.grade?.name}
                    </h3>
                  </div>

                  {gradeSubjects.length === 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-xs font-bold">
                      لا توجد مواد مُسندة لهذه المرحلة بعد — أضِف مواد من صفحة
                      "المواد الدراسية" أولًا.
                    </div>
                  )}

                  {dayOrder.map((day) => (
                    <div
                      key={day}
                      className="bg-slate-50/60 border border-slate-100 rounded-3xl p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-700">
                          {daysMapping[day]}
                        </span>
                        {addingDay !== day && (
                          <button
                            type="button"
                            onClick={() => startAddingPeriod(day)}
                            disabled={gradeSubjects.length === 0}
                            className="flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Plus size={14} /> إضافة حصة
                          </button>
                        )}
                      </div>

                      {periodsForDay(day).length === 0 && addingDay !== day && (
                        <p className="text-[11px] font-bold text-slate-400">
                          مفيش حصص متسجّلة لهذا اليوم لسه.
                        </p>
                      )}

                      {periodsForDay(day).map((s) => (
                        <div
                          key={s._id}
                          className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-100 p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-black text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg shrink-0">
                              {s.startTime}–{s.endTime}
                            </span>
                            <span className="text-sm font-black text-slate-700 truncate">
                              {s.subject?.name || "بدون مادة"}
                            </span>
                            <span className="text-xs font-bold text-slate-400 truncate">
                              أ. {s.teacher?.firstName} {s.teacher?.lastName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openBuilderForEdit(s)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(s._id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {addingDay === day && (
                        <div className="bg-white rounded-2xl border-2 border-indigo-100 p-4 space-y-3">
                          {periodError && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 font-bold text-xs">
                              <AlertCircle size={14} /> {periodError}
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">
                                المادة
                              </label>
                              <select
                                className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 text-sm transition-all"
                                value={periodForm.subjectId}
                                onChange={(e) => handleSubjectChange(e.target.value)}
                              >
                                <option value="">اختر المادة...</option>
                                {gradeSubjects.map((sub) => (
                                  <option key={sub._id} value={sub._id}>
                                    {sub.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">
                                المعلم
                              </label>
                              <select
                                disabled={!periodForm.subjectId}
                                className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-500 bg-white outline-none font-bold text-slate-700 text-sm transition-all disabled:opacity-50"
                                value={periodForm.teacherId}
                                onChange={(e) =>
                                  setPeriodForm((prev) => ({
                                    ...prev,
                                    teacherId: e.target.value,
                                  }))
                                }
                              >
                                <option value="">
                                  {periodForm.subjectId
                                    ? "اختر المعلم..."
                                    : "اختر المادة أولاً"}
                                </option>
                                {eligibleTeachers.map((t) => (
                                  <option key={t._id} value={t._id}>
                                    {t.firstName} {t.lastName}
                                  </option>
                                ))}
                              </select>
                              {periodForm.subjectId &&
                                eligibleTeachers.length === 0 && (
                                  <p className="text-[10px] font-bold text-rose-500">
                                    مفيش معلم مسند لهذه المادة في هذه المرحلة.
                                  </p>
                                )}
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">
                                وقت البداية
                              </label>
                              <input
                                type="time"
                                className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm transition-all"
                                value={periodForm.startTime}
                                onChange={(e) =>
                                  setPeriodForm((prev) => ({
                                    ...prev,
                                    startTime: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">
                                وقت النهاية
                              </label>
                              <input
                                type="time"
                                className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm transition-all"
                                value={periodForm.endTime}
                                onChange={(e) =>
                                  setPeriodForm((prev) => ({
                                    ...prev,
                                    endTime: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              disabled={periodSaving}
                              onClick={() => handleSavePeriod(day)}
                              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-xl font-black flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                            >
                              {periodSaving ? (
                                <Loader2 className="animate-spin" size={16} />
                              ) : (
                                <Save size={16} />
                              )}
                              {editingPeriodId ? "تحديث الحصة" : "حفظ الحصة"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingDay(null);
                                resetPeriodForm();
                              }}
                              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-bold text-sm transition-all"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-6 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
              <Trash2 size={30} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                حذف الحصة
              </h3>
              <p className="text-sm font-medium text-slate-500">
                هل أنت متأكد من حذف هذه الحصة؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-lg shadow-rose-100 transition-all"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulesPage;
