const { toHalf } = require("./halfMarks");

// The words of «تقريري الشهري» (utils/monthlyReport.js), written to the
// student: what the month says about them, what they did well, and a plan
// for next month made of the few things that would win back the most marks.
// Every sentence is worked out from their own marks — no line is said to a
// student it isn't true of.

// The bands the app's «أدائي» reads a share of the marks as
// (edulink-mobile components/Student/performance.js levelOf).
const levelOf = (percent) => {
  if (percent === null || percent === undefined) return null;
  if (percent >= 85) return "ممتاز";
  if (percent >= 75) return "جيد جدًا";
  if (percent >= 50) return "جيد";
  return "يحتاج متابعة";
};

const fmt = (n) => (n === null || n === undefined ? "—" : String(toHalf(n)));
const joinAnd = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join("، ")} و${items[items.length - 1]}`;
const times = (n) => (n === 1 ? "مرة" : n === 2 ? "مرتين" : n <= 10 ? `${n} مرات` : `${n} مرة`);
const marks = (n) => {
  const v = toHalf(n);
  if (v === 1) return "درجة";
  if (v === 2) return "درجتين";
  return v <= 10 && Number.isInteger(v) ? `${v} درجات` : `${v} درجة`;
};

// What each column asks of the student, said to them.
const COLUMN_ADVICE = {
  homeworkScore: (g) =>
    `${g("سلّم", "سلّمي")} كل واجب كامل وفي ميعاده، ودي أسهل درجات ممكن ${g("تكسبها", "تكسبيها")}.`,
  weeklyEvalScore: (g) =>
    `التقييم بييجي على دروس الأسبوع نفسه، ف${g("راجع", "راجعي")} كل درس في نفس يومه ربع ساعة، و${g("اسأل", "اسألي")} المدرّس في أي حتة مش ${g("فاهمها", "فاهماها")} قبل التقييم.`,
  attendanceScore: (g) =>
    `الدرجة دي المدرّس بيديهالك على حضورك والتزامك ومشاركتك في الحصة: ${g("خليك", "خليكي")} في الحصة من أولها و${g("شارك", "شاركي")} فيها.`,
  classworkScore: (g) =>
    `${g("اكتب", "اكتبي")} كل اللي بيتشرح في الكراسة، وخليها كاملة ومترتبة.`,
};

// The marks a month mark should aim at: the next level up, no more than six
// marks away, or — already at the top — a little higher, up to full marks.
const targetFor = (mark, max) => {
  if (mark === null || mark === undefined) return null;
  const bands = [0.5, 0.75, 0.85].map((b) => Math.ceil(b * max));
  if (mark >= bands[2]) return Math.min(max, Math.ceil(mark + (max - mark) / 2));
  const next = bands.find((b) => b > mark);
  return next - mark > 6 ? Math.ceil(mark + 6) : next;
};

// Where one subject fell short, mark by mark — each week column and the
// test: how far below its maximum, and how many of its zeros were «غ».
// `strict` keeps only what is well short (15% or more); otherwise anything
// short at all, for a student with little left to win.
const shortfallsOf = (s, strict) => {
  const out = [];
  const short = (gap, max) => gap > 0 && (!strict || (gap >= 1 && gap / max >= 0.15));
  s.columns.forEach((c) => {
    if (c.average === null) return;
    const gap = c.max - c.average;
    if (!short(gap, c.max)) return;
    const absent = s.absences.find((a) => a.column === c.key);
    out.push({ kind: c.key, label: c.label, subject: s.subject, value: c.average, max: c.max, gap, absent: absent ? absent.count : 0 });
  });
  if (s.test && s.test.grade !== null) {
    const gap = s.test.max - s.test.grade;
    if (short(gap, s.test.max)) {
      out.push({
        kind: "test",
        label: "اختبار الشهر",
        subject: s.subject,
        value: s.test.grade,
        max: s.test.max,
        gap,
        absent: s.test.absent ? 1 : 0,
        classAverage: s.classTestAverage,
      });
    }
  }
  return out;
};

// One point of the plan: one kind of mark, over every subject it fell short
// in — «التقييم الأسبوعي في علوم ورياضيات» — so the plan names the habit to
// change, not the same habit three times.
const planPoint = (kind, list, g) => {
  const rows = [...list].sort((a, b) => b.gap - a.gap);
  const { label, max } = rows[0];
  const names = rows.map((r) => r.subject);
  const where = names.length <= 3 ? joinAnd(names) : `${names.length} مواد`;
  const values = rows.map((r, i) => `${fmt(r.value)}${i === 0 ? ` من ${max}` : ""} في ${r.subject}`).join("، ");

  const parts = [];
  if (kind === "test") {
    const taken = rows.filter((r) => !r.absent);
    const missed = rows.filter((r) => r.absent);
    if (taken.length) {
      const one = taken.length === 1 && taken[0].classAverage !== null;
      parts.push(
        `${g("خدت", "خدتي")} ${taken.map((r, i) => `${fmt(r.value)}${i === 0 ? ` من ${max}` : ""} في ${r.subject}`).join("، ")}${one ? ` ومتوسط فصلك فيه ${fmt(taken[0].classAverage)}` : ""}.`,
      );
    }
    if (missed.length) parts.push(`${g("غبت", "غبتي")} عن اختبار ${joinAnd(missed.map((r) => r.subject))} واتحسب صفر.`);
    parts.push(
      `${g("ابدأ", "ابدئي")} المراجعة قبل الاختبار الجاي بأسبوع مش ليلته، و${g("حل", "حلي")} أسئلة التقييمات اللي فاتت تاني.`,
    );
  } else {
    parts.push(`متوسطك ${values}.`);
    const absences = rows.filter((r) => r.absent);
    const count = absences.reduce((a, r) => a + r.absent, 0);
    if (count) {
      parts.push(
        `${g("واتسجّلت غايب", "واتسجّلتي غايبة")} فيه ${times(count)} في ${joinAnd(absences.map((r) => r.subject))} واتحسب صفر، فحضورك يومها لوحده هيرجّع جزء كبير من الدرجات دي.`,
      );
    }
    parts.push(COLUMN_ADVICE[kind](g));
  }
  return {
    kind,
    subjects: names,
    gain: rows.reduce((a, r) => a + r.gap, 0),
    title: `${label} في ${where}`,
    text: parts.join(" "),
  };
};

// The three kinds of mark that would win back the most next month.
const pickPlan = (subjects, g, strict) => {
  const byKind = new Map();
  subjects.flatMap((s) => shortfallsOf(s, strict)).forEach((x) => {
    byKind.set(x.kind, [...(byKind.get(x.kind) || []), x]);
  });
  return [...byKind.entries()]
    .map(([kind, list]) => planPoint(kind, list, g))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
};

// The subject whose month slid most from its first week to its last, by 15
// points or more, or null.
const slideOf = (subjects) => {
  let worst = null;
  subjects.forEach((s) => {
    const totals = s.weeks.filter((w) => w.total !== null && w.outOf);
    if (totals.length < 3) return;
    const first = totals[0];
    const last = totals[totals.length - 1];
    const drop = first.total / first.outOf - last.total / last.outOf;
    if (drop >= 0.15 && (!worst || drop > worst.drop)) worst = { subject: s.subject, first, last, drop };
  });
  return worst;
};

const adviceFor = (report) => {
  const g = (male, female) => (report.student.female ? female : male);
  const first = report.student.firstName;
  const subjects = report.subjects.filter((s) => s.monthMark !== null || (s.test && s.test.grade !== null));
  const level = report.overall?.level || null;

  // The plan: what needs work first; a student with little short of full
  // marks gets the last few marks there are instead.
  let plan = pickPlan(subjects, g, true);
  const polishing = plan.length < 2;
  if (polishing) plan = pickPlan(subjects, g, false);

  // What went well.
  const strengths = [];
  const excellent = subjects.filter((s) => s.monthMark !== null && s.monthMark / s.weekTotal >= 0.85);
  if (excellent.length) {
    strengths.push(
      excellent.length === subjects.length
        ? `مستواك ممتاز في كل المواد.`
        : `مستواك ممتاز في ${joinAnd(excellent.map((s) => s.subject))}.`,
    );
  }
  const fullColumns = {};
  subjects.forEach((s) =>
    s.columns.filter((c) => c.full && c.average === c.max).forEach((c) => {
      fullColumns[c.label] = [...(fullColumns[c.label] || []), s.subject];
    }),
  );
  Object.entries(fullColumns)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 1)
    .forEach(([label, names]) => {
      strengths.push(
        `${g("خدت", "خدتي")} درجة ${label} كاملة في كل أسابيع الشهر في ${names.length === subjects.length ? "كل المواد" : joinAnd(names)}.`,
      );
    });
  const fullTests = subjects.filter((s) => s.test && s.test.grade !== null && s.test.grade === s.test.max);
  if (fullTests.length) {
    strengths.push(`${g("قفلت", "قفلتي")} اختبار ${joinAnd(fullTests.map((s) => s.subject))} ${fullTests[0].test.max} من ${fullTests[0].test.max}.`);
  }
  const above = subjects
    .filter((s) => s.monthMark !== null && s.classAverage !== null && s.monthMark - s.classAverage >= 3)
    .sort((a, b) => b.monthMark - b.classAverage - (a.monthMark - a.classAverage));
  if (above.length && strengths.length < 3) {
    const s = above[0];
    strengths.push(`في ${s.subject} ${g("انت", "انتي")} فوق متوسط فصلك بـ ${marks(s.monthMark - s.classAverage)}.`);
  }
  // A month that got better as it went: its last two weeks against its first.
  const trend = (report.weekTrend || []).filter((w) => w.percent !== null);
  if (trend.length >= 3 && strengths.length < 3) {
    const half = Math.floor(trend.length / 2);
    const early = trend.slice(0, half).reduce((a, w) => a + w.percent, 0) / half;
    const late = trend.slice(-half).reduce((a, w) => a + w.percent, 0) / half;
    if (late - early >= 15) {
      strengths.push(
        `مستواك اتحسن مع الشهر: من ${trend[0].percent}% في أول أسبوع لـ ${trend[trend.length - 1].percent}% في آخره، ${g("كمّل", "كمّلي")} على كده.`,
      );
    }
  }
  if (report.complete && report.absentDays === 0 && strengths.length < 3) {
    strengths.push(`ولا يوم غياب طول الشهر.`);
  }
  if (!strengths.length && subjects.length) {
    const best = [...subjects]
      .filter((s) => s.monthMark !== null)
      .sort((a, b) => b.monthMark / b.weekTotal - a.monthMark / a.weekTotal)[0];
    if (best) {
      strengths.push(
        `أحسن مادة عندك الشهر ده ${best.subject}: ${fmt(best.monthMark)} من ${best.weekTotal}. ده دليل إنك ${g("تقدر", "تقدري")}، ونفس الطريقة تنفع في باقي المواد.`,
      );
    }
  }

  const headline =
    level === "ممتاز"
      ? `شهر ممتاز يا ${first}!`
      : level === "جيد جدًا"
        ? `شهر كويس جدًا يا ${first}`
        : level === "جيد"
          ? `شهر كويس يا ${first}، و${g("تقدر", "تقدري")} أحسن`
          : `يا ${first}، الشهر ده محتاج منك وقفة`;

  // One point a line; a number never ends a line on a full stop, which the
  // PDF's bidi would carry to the wrong side of it.
  const lines = [];
  if (report.overall) {
    lines.push(`مجموعك ${fmt(report.overall.earned)} من ${report.overall.possible} يعني ${report.overall.percent}%`);
    if (report.classOverall) lines.push(`متوسط فصلك ${report.classOverall.percent}%`);
  }
  if (report.change) {
    const diff = report.change.to - report.change.from;
    if (diff >= 2) lines.push(`${g("طلعت", "طلعتي")} من ${report.change.from}% الشهر اللي فات لـ ${report.change.to}% الشهر ده`);
    else if (diff <= -2) lines.push(`${g("نزلت", "نزلتي")} من ${report.change.from}% الشهر اللي فات لـ ${report.change.to}% الشهر ده`);
  }
  const slide = slideOf(subjects);
  if (slide) {
    lines.push(
      `خلّي بالك من ${slide.subject}: آخر أسبوع ${g("خدت", "خدتي")} فيه ${fmt(slide.last.total)} من ${slide.last.outOf} بعد ما ${g("كنت", "كنتي")} ${fmt(slide.first.total)} في أول الشهر`,
    );
  }
  const targets = subjects
    .filter((s) => s.monthMark !== null)
    .map((s) => ({ subject: s.subject, current: s.monthMark, target: targetFor(s.monthMark, s.weekTotal), max: s.weekTotal }));

  // Where the targets would take the month — a step, not every mark there is.
  const step = targets.reduce((a, t) => a + (t.target - t.current), 0);
  const reach = report.overall ? Math.round(((report.overall.earned + step) / report.overall.possible) * 100) : null;
  if (!polishing && reach !== null && reach > report.overall.percent) {
    const next = levelOf(reach);
    lines.push(
      `لو ${g("وصلت", "وصلتي")} لأهدافك اللي في آخر التقرير، مستواك يطلع لـ ${reach}%${next !== level ? ` ويبقى ${next}` : ""} الشهر الجاي.`,
    );
  } else if (polishing && plan.length) {
    lines.push(`فاضلك درجات قليلة على الدرجة النهائية، والخطة اللي تحت بتقولك هي فين.`);
  }

  return { headline, summary: lines, strengths: strengths.slice(0, 3), plan, polishing, targets };
};

module.exports = { adviceFor, levelOf, targetFor };
