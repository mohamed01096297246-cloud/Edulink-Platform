import React from "react";
import { Plus, Trash2, Printer } from "lucide-react";

// One class's week laid out the way it hangs on the classroom wall: days
// down the side, periods across the top, the subject in each square with
// its teacher underneath. A square the bell schedule has no period for that
// day is shaded, like the greyed squares on the printed sheet.

const DAYS = [
  ["sat", "السبت"],
  ["sun", "الأحد"],
  ["mon", "الاثنين"],
  ["tue", "الثلاثاء"],
  ["wed", "الأربعاء"],
  ["thu", "الخميس"],
];

const PERIOD_NAMES = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];

const teacherName = (t) => (t ? `أ. ${t.firstName} ${t.lastName}` : "");

// The bell schedule covering this class's grade on a day.
const bellFor = (bells, gradeId, day) =>
  bells.find(
    (b) => (b.days || []).includes(day) && (b.grades || []).some((g) => String(g._id || g) === String(gradeId)),
  );

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const ClassTimetable = ({ classroom, lessons, bells, canEdit, onEdit, onAdd, onDelete }) => {
  const gradeId = classroom?.grade?._id || classroom?.grade;

  const slots = new Map(); // `${day}:${period}` → bell slot
  let maxPeriod = 0;
  for (const [day] of DAYS) {
    const bell = bellFor(bells, gradeId, day);
    for (const p of bell?.periods || []) {
      slots.set(`${day}:${p.period}`, p);
      maxPeriod = Math.max(maxPeriod, p.period);
    }
  }
  const byCell = new Map();
  for (const l of lessons) {
    if (!l.period) continue;
    maxPeriod = Math.max(maxPeriod, l.period);
    byCell.set(`${l.day}:${l.period}`, l);
  }
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  // A school-week day shows even with no lessons yet; Saturday only when
  // something is booked on it, or a bell covers it.
  const days = DAYS.filter(
    ([day]) => day !== "sat" || lessons.some((l) => l.day === "sat") || bellFor(bells, gradeId, "sat"),
  );

  // The printed sheet: plain HTML in its own window, so nothing of the
  // panel around it ends up on paper.
  const print = () => {
    const head = periods.map((p) => `<th>${PERIOD_NAMES[p] || p}</th>`).join("");
    const rows = days
      .map(([day, label]) => {
        const cells = periods
          .map((p) => {
            const lesson = byCell.get(`${day}:${p}`);
            if (lesson) {
              return `<td><b>${escapeHtml(lesson.subject?.name)}</b><small>${escapeHtml(teacherName(lesson.teacher))}</small></td>`;
            }
            return slots.has(`${day}:${p}`) ? "<td></td>" : '<td class="off"></td>';
          })
          .join("");
        return `<tr><th class="day">${label}</th>${cells}</tr>`;
      })
      .join("");
    const title = `جدول الحصص الأسبوعي لفصل ${escapeHtml(classroom?.name)} — ${escapeHtml(classroom?.grade?.name || "")}`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #111; }
  h1 { text-align: center; font-size: 20px; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 2px solid #111; text-align: center; padding: 8px 4px; height: 58px; vertical-align: middle; }
  th { background: #f1f1f1; font-size: 14px; }
  th.day { width: 90px; }
  td b { display: block; font-size: 15px; }
  td small { display: block; font-size: 10px; color: #444; margin-top: 3px; }
  td.off { background: repeating-linear-gradient(45deg, #d6d6d6 0 4px, #ececec 4px 8px); }
</style></head><body><h1>${title}</h1>
<table><thead><tr><th class="day">اليوم / الحصة</th>${head}</tr></thead><tbody>${rows}</tbody></table>
<script>window.onload = () => { window.print(); };</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-slate-100">
        <div>
          <p className="text-[11px] font-black text-slate-400">جدول الحصص الأسبوعي</p>
          <h2 className="text-xl font-black text-slate-800">
            فصل {classroom?.name}
            <span className="text-sm font-bold text-slate-400"> — {classroom?.grade?.name}</span>
          </h2>
        </div>
        <button
          onClick={print}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-indigo-600 transition-colors"
        >
          <Printer size={16} /> طباعة الجدول
        </button>
      </div>

      {periods.length === 0 ? (
        <p className="p-12 text-center font-bold text-slate-400">
          مفيش مواعيد حصص متحددة لمرحلة الفصل ده. حددها من صفحة «مواعيد الحصص» الأول.
        </p>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse table-fixed min-w-[760px]">
            <thead>
              <tr>
                <th className="w-24 border-2 border-slate-700 bg-slate-100 p-2 text-[11px] font-black text-slate-600">
                  اليوم / الحصة
                </th>
                {periods.map((p) => (
                  <th key={p} className="border-2 border-slate-700 bg-slate-100 p-2 text-sm font-black text-slate-800">
                    {PERIOD_NAMES[p] || p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(([day, label]) => (
                <tr key={day}>
                  <th className="border-2 border-slate-700 bg-slate-100 p-2 text-sm font-black text-slate-800">{label}</th>
                  {periods.map((p) => {
                    const lesson = byCell.get(`${day}:${p}`);
                    const slot = slots.get(`${day}:${p}`);
                    if (!lesson && !slot) {
                      return (
                        <td
                          key={p}
                          className="border-2 border-slate-700"
                          style={{ background: "repeating-linear-gradient(45deg, #cbd5e1 0 4px, #e2e8f0 4px 8px)" }}
                          title="مفيش حصة في الميعاد ده"
                        />
                      );
                    }
                    if (!lesson) {
                      return (
                        <td key={p} className="border-2 border-slate-700 h-20 p-1 text-center">
                          {canEdit && (
                            <button
                              onClick={() => onAdd(day, p)}
                              className="w-full h-full min-h-[64px] rounded-lg text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors"
                              aria-label={`إضافة حصة ${label} الحصة ${PERIOD_NAMES[p]}`}
                              title={slot ? `${slot.startTime} - ${slot.endTime}` : ""}
                            >
                              <Plus size={18} />
                            </button>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={p} className="border-2 border-slate-700 h-20 p-1 text-center align-middle">
                        <div
                          className={`group relative rounded-lg px-1 py-2 h-full ${canEdit ? "cursor-pointer hover:bg-indigo-50" : ""}`}
                          onClick={canEdit ? () => onEdit(lesson) : undefined}
                          title={`${lesson.startTime} - ${lesson.endTime}`}
                        >
                          <p className="font-black text-slate-800 text-[15px] leading-tight">{lesson.subject?.name}</p>
                          <p className={`text-[10px] font-bold mt-1 leading-tight ${lesson.teacher ? "text-slate-500" : "text-slate-300"}`}>
                            {lesson.teacher ? teacherName(lesson.teacher) : "بدون معلم"}
                          </p>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(lesson);
                              }}
                              className="absolute top-0.5 left-0.5 p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              aria-label="حذف الحصة"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] font-bold text-slate-400">
            اضغط على أي حصة لتعديلها، أو على خانة فاضية لإضافة حصة فيها. الخانات المخططة مافيهاش حصة في الميعاد ده.
          </p>
        </div>
      )}
    </div>
  );
};

export default ClassTimetable;
