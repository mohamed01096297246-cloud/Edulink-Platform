const PDFDocument = require("pdfkit");
const { visualRuns, runsWidth, drawRuns, FONTS } = require("./sheetPdf");
const { toHalf } = require("./halfMarks");

// «تقريري الشهري» on one A4 page (utils/monthlyReport.js builds it): the
// month at a glance, every subject's marks column by column beside the
// class's, what went well, the plan for next month and a target per subject.
// Arabic is laid out word by word through sheetPdf's bidi runs.

const C = {
  brand: "#00259E",
  brandSoft: "#E0E7FF",
  ink: "#0F172A",
  body: "#1E293B",
  rule: "#475569",
  grid: "#94A3B8",
  head: "#E2E8F0",
  white: "#FFFFFF",
  good: "#047857",
  goodSoft: "#D1FAE5",
  mid: "#92400E",
  midSoft: "#FEF3C7",
  low: "#B91C1C",
  lowSoft: "#FEE2E2",
  none: "#64748B",
};

const LEVEL_TONE = {
  ممتاز: { ink: C.good, fill: C.goodSoft },
  "جيد جدًا": { ink: C.brand, fill: C.brandSoft },
  جيد: { ink: C.mid, fill: C.midSoft },
  "يحتاج متابعة": { ink: C.low, fill: C.lowSoft },
};

const toneOf = (value, max) => {
  if (value === null || value === undefined || !max) return { ink: C.none, fill: "#F1F5F9" };
  const r = value / max;
  if (r >= 0.75) return { ink: C.good, fill: C.goodSoft };
  if (r >= 0.5) return { ink: C.mid, fill: C.midSoft };
  return { ink: C.low, fill: C.lowSoft };
};

const levelOfShare = (value, max) => {
  if (value === null || value === undefined || !max) return null;
  const p = (value / max) * 100;
  if (p >= 85) return "ممتاز";
  if (p >= 75) return "جيد جدًا";
  if (p >= 50) return "جيد";
  return "يحتاج متابعة";
};

// The table's column heads, short enough for a 52pt column.
const SHORT = {
  homeworkScore: "الواجب",
  weeklyEvalScore: "التقييم",
  attendanceScore: "المواظبة",
  classworkScore: "الكراسة",
  test: "الاختبار",
};

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const dayMonth = (d) => `${new Date(d).getUTCDate()} ${MONTHS[new Date(d).getUTCMonth()]}`;
const fullDate = (d) => `${dayMonth(d)} ${new Date(d).getUTCFullYear()}`;
const num = (n) => (n === null || n === undefined ? "—" : String(toHalf(n)));

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 30;
const W = PAGE_W - 2 * M;

// Wraps `text` to `width` and draws it; returns the height it took.
const write = (doc, text, x, y, width, { size = 11, bold = false, color = C.body, align = "right", leading = 1.5 } = {}) => {
  doc.font(bold ? "bold" : "regular").fontSize(size).fillColor(color);
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || runsWidth(doc, visualRuns(candidate)) <= width) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    const runs = visualRuns(l);
    const lw = runsWidth(doc, runs);
    const tx = align === "center" ? x + (width - lw) / 2 : align === "left" ? x : x + width - lw;
    drawRuns(doc, runs, tx, y + i * size * leading);
  });
  return lines.length * size * leading;
};

const heightOf = (doc, text, width, opts = {}) => {
  const size = opts.size || 11;
  doc.font(opts.bold ? "bold" : "regular").fontSize(size);
  const words = String(text).split(/\s+/).filter(Boolean);
  let count = 0;
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || runsWidth(doc, visualRuns(candidate)) <= width) line = candidate;
    else {
      count += 1;
      line = word;
    }
  });
  if (line) count += 1;
  return count * size * (opts.leading || 1.5);
};

const pill = (doc, text, x, y, w, h, tone, size = 10) => {
  doc.roundedRect(x, y, w, h, h / 2).fill(tone.fill);
  write(doc, text, x, y + (h - size * 1.2) / 2, w, { size, bold: true, color: tone.ink, align: "center", leading: 1.2 });
};

const sectionTitle = (doc, text, y) => {
  doc.rect(PAGE_W - M - 4, y + 2, 4, 15).fill(C.brand);
  write(doc, text, M, y, W - 12, { size: 14, bold: true, color: C.ink, leading: 1.3 });
  return y + 26;
};

const header = (doc, r) => {
  doc.rect(0, 0, PAGE_W, 104).fill(C.brand);
  write(doc, "تقريري الشهري", M, 24, W, { size: 24, bold: true, color: C.white, leading: 1.2 });
  write(doc, `${r.month.label} · من ${dayMonth(r.month.from)} لـ ${fullDate(r.month.to)}`, M, 62, W, {
    size: 12,
    color: C.white,
    leading: 1.2,
  });
  const left = 260;
  write(doc, r.student.name, M, 24, left, { size: 14, bold: true, color: C.white, align: "left", leading: 1.3 });
  write(doc, [r.student.grade, r.student.classroom ? `فصل ${r.student.classroom}` : ""].filter(Boolean).join(" · "), M, 46, left, {
    size: 11,
    color: C.white,
    align: "left",
    leading: 1.3,
  });
  write(doc, r.student.school, M, 64, left, { size: 10, color: C.white, align: "left", leading: 1.3 });
};

const summary = (doc, r, y) => {
  const a = r.advice;
  const boxW = 118;
  const level = r.overall?.level;
  const tone = LEVEL_TONE[level] || { ink: C.none, fill: "#F1F5F9" };
  const textW = W - boxW - 20;
  const stats = [
    `أيام الغياب: ${r.absentDays}`,
    ...(r.missingHomework ? [`واجبات ما اتسلمتش: ${r.missingHomework}`] : []),
    ...(r.praise ? [`ملاحظات شكر: ${r.praise}`] : []),
  ];
  const lines = a.summary;
  const textH =
    heightOf(doc, a.headline, textW - 6, { size: 16, bold: true, leading: 1.35 }) +
    6 +
    lines.reduce((t, l) => t + heightOf(doc, l, textW - 6, { size: 11.5, leading: 1.6 }), 0) +
    34;
  const h = Math.max(118, textH + 16);

  doc.lineWidth(1).strokeColor(C.rule).roundedRect(M, y, W, h, 10).stroke();
  const bx = PAGE_W - M - boxW - 10;
  doc.roundedRect(bx, y + 10, boxW, h - 20, 8).fill(tone.fill);
  write(doc, "مستواك العام", bx, y + 18, boxW, { size: 10.5, bold: true, color: tone.ink, align: "center", leading: 1.2 });
  write(doc, r.overall ? `${r.overall.percent}%` : "—", bx, y + 34, boxW, {
    size: 30,
    bold: true,
    color: tone.ink,
    align: "center",
    leading: 1.2,
  });
  write(doc, level || "لسه مفيش درجات", bx, y + h - 42, boxW, { size: 13, bold: true, color: tone.ink, align: "center", leading: 1.2 });

  const tx = M + 12;
  let ty = y + 12;
  ty += write(doc, a.headline, tx, ty, textW - 6, { size: 16, bold: true, color: C.ink, leading: 1.35 }) + 6;
  lines.forEach((l) => {
    ty += write(doc, l, tx, ty, textW - 6, { size: 11.5, color: C.body, leading: 1.6 });
  });

  // The month's other numbers, along the bottom.
  doc.font("bold").fontSize(9.5);
  let sx = bx - 10;
  stats.forEach((s) => {
    const sw = runsWidth(doc, visualRuns(s)) + 18;
    sx -= sw;
    pill(doc, s, sx, y + h - 30, sw, 20, { ink: C.body, fill: C.head }, 9.5);
    sx -= 6;
  });
  return y + h + 16;
};

// The subjects, one row each: the month's columns, the month mark and its
// test, the level, the class's average, and the four weeks as bars.
const table = (doc, r, y) => {
  y = sectionTitle(doc, "مستواك في كل مادة", y);
  const first = r.subjects[0];
  const cols = [
    { key: "subject", label: "المادة", w: 88 },
    ...(first ? first.columns : []).map((c) => ({ key: c.key, label: `${SHORT[c.key]}\nمن ${c.max}`, w: 52, max: c.max })),
    { key: "month", label: `الشهر\nمن ${first ? first.weekTotal : 40}`, w: 54 },
    ...(first && first.test ? [{ key: "test", label: `الاختبار\nمن ${first.test.max}`, w: 52 }] : []),
    { key: "level", label: "المستوى", w: 70 },
    { key: "class", label: "متوسط\nالفصل", w: 48 },
  ];
  const used = cols.reduce((a, c) => a + c.w, 0);
  cols.push({ key: "weeks", label: "أسابيع\nالشهر", w: W - used });

  const headH = 34;
  const rowH = 36;
  let x = PAGE_W - M;
  cols.forEach((c) => {
    x -= c.w;
    c.x = x;
  });
  doc.rect(M, y, W, headH).fill(C.head);
  cols.forEach((c) => {
    const parts = c.label.split("\n");
    parts.forEach((p, i) => {
      write(doc, p, c.x, y + (parts.length === 1 ? 11 : 4 + i * 13), c.w, {
        size: i === 0 ? 9.5 : 8.5,
        bold: i === 0,
        color: C.ink,
        align: "center",
        leading: 1.2,
      });
    });
  });
  let ry = y + headH;

  r.subjects.forEach((s, i) => {
    if (i % 2 === 1) doc.rect(M, ry, W, rowH).fill("#F8FAFC");
    cols.forEach((c) => {
      const mid = ry + rowH / 2;
      if (c.key === "subject") {
        write(doc, s.subject, c.x + 4, mid - 8, c.w - 10, { size: 11.5, bold: true, color: C.ink, leading: 1.2 });
      } else if (c.max) {
        const col = s.columns.find((k) => k.key === c.key);
        const v = col ? col.average : null;
        write(doc, num(v), c.x, mid - 8, c.w, { size: 12, bold: true, color: toneOf(v, c.max).ink, align: "center", leading: 1.2 });
      } else if (c.key === "month") {
        const v = s.monthMark;
        const text = v === null ? (s.withdrawnMonth ? "م" : "—") : num(v);
        doc.roundedRect(c.x + 6, mid - 12, c.w - 12, 24, 6).fill(toneOf(v, s.weekTotal).fill);
        write(doc, text, c.x, mid - 9, c.w, { size: 13, bold: true, color: toneOf(v, s.weekTotal).ink, align: "center", leading: 1.2 });
      } else if (c.key === "test") {
        const t = s.test;
        const text = !t ? "—" : t.withdrawn ? "م" : t.absent ? "غ" : num(t.grade);
        const tone = t && t.absent ? { ink: C.low } : toneOf(t ? t.grade : null, t ? t.max : 0);
        write(doc, text, c.x, mid - 8, c.w, { size: 12, bold: true, color: tone.ink, align: "center", leading: 1.2 });
      } else if (c.key === "level") {
        // The subject's level is its share of the month and the test together.
        const earned = (s.monthMark || 0) + (s.test && s.test.grade !== null ? s.test.grade : 0);
        const possible = (s.monthMark !== null ? s.weekTotal : 0) + (s.test && s.test.grade !== null ? s.test.max : 0);
        const level = possible ? levelOfShare(earned, possible) : null;
        if (level) pill(doc, level, c.x + 4, mid - 10, c.w - 8, 20, LEVEL_TONE[level], 9.5);
        else write(doc, "—", c.x, mid - 8, c.w, { size: 12, color: C.none, align: "center", leading: 1.2 });
      } else if (c.key === "class") {
        write(doc, num(s.classAverage), c.x, mid - 8, c.w, { size: 11.5, color: C.body, align: "center", leading: 1.2 });
      } else if (c.key === "weeks") {
        // Oldest week on the right, as the page reads.
        const barW = 9;
        const gap = 5;
        const total = s.weeks.length * barW + (s.weeks.length - 1) * gap;
        let bx = c.x + (c.w + total) / 2 - barW;
        const base = ry + rowH - 7;
        const full = rowH - 14;
        s.weeks.forEach((w) => {
          doc.rect(bx, base - full, barW, full).fill("#E2E8F0");
          if (w.total !== null && w.outOf) {
            const h = Math.max(2, (w.total / w.outOf) * full);
            doc.rect(bx, base - h, barW, h).fill(toneOf(w.total, w.outOf).ink);
          }
          bx -= barW + gap;
        });
      }
    });
    doc.lineWidth(0.6).strokeColor(C.grid).moveTo(M, ry + rowH).lineTo(PAGE_W - M, ry + rowH).stroke();
    ry += rowH;
  });
  doc.lineWidth(1).strokeColor(C.rule).rect(M, y, W, ry - y).stroke();
  return ry + 18;
};

const bullets = (doc, title, items, y) => {
  if (!items.length) return y;
  y = sectionTitle(doc, title, y);
  items.forEach((t) => {
    doc.circle(PAGE_W - M - 6, y + 9, 3).fill(C.good);
    y += write(doc, t, M, y, W - 18, { size: 11.5, color: C.body, leading: 1.55 }) + 4;
  });
  return y + 10;
};

const plan = (doc, r, y) => {
  const items = r.advice.plan;
  if (!items.length) return y;
  y = sectionTitle(doc, r.advice.polishing ? "آخر درجات فاضلة لك" : "خطتك للشهر الجاي", y);
  const chipW = 74;
  const textW = W - chipW - 62;
  items.forEach((p, i) => {
    const h = Math.max(
      44,
      heightOf(doc, p.title, textW, { size: 12, bold: true, leading: 1.4 }) +
        heightOf(doc, p.text, textW, { size: 11, leading: 1.55 }) +
        16,
    );
    doc.lineWidth(0.8).strokeColor(C.grid).roundedRect(M, y, W, h, 8).stroke();
    doc.circle(PAGE_W - M - 20, y + 20, 12).fill(C.brand);
    write(doc, String(i + 1), PAGE_W - M - 32, y + 12, 24, { size: 13, bold: true, color: C.white, align: "center", leading: 1.2 });
    const tx = M + chipW + 14;
    let ty = y + 8;
    ty += write(doc, p.title, tx, ty, textW, { size: 12, bold: true, color: C.ink, leading: 1.4 });
    write(doc, p.text, tx, ty, textW, { size: 11, color: C.body, leading: 1.55 });
    // The marks this point lost the month — what there is to win back.
    pill(doc, `ضاع ${num(p.gain)}`, M + 10, y + 12, chipW - 8, 24, { ink: C.mid, fill: C.midSoft }, 10.5);
    y += h + 8;
  });
  return y + 8;
};

const targets = (doc, r, y) => {
  const list = r.advice.targets;
  if (!list.length) return y;
  y = sectionTitle(doc, "هدفك في كل مادة الشهر الجاي", y);
  const gap = 8;
  const w = (W - gap * (list.length - 1)) / list.length;
  const h = 64;
  list.forEach((t, i) => {
    const x = PAGE_W - M - (i + 1) * w - i * gap;
    doc.lineWidth(0.8).strokeColor(C.grid).roundedRect(x, y, w, h, 8).stroke();
    write(doc, t.subject, x, y + 7, w, { size: 11, bold: true, color: C.ink, align: "center", leading: 1.2 });
    write(doc, `${t.target} من ${t.max}`, x, y + 25, w, { size: 15, bold: true, color: C.brand, align: "center", leading: 1.2 });
    const kept = t.current >= t.max;
    write(doc, kept ? (r.student.female ? "حافظي عليها" : "حافظ عليها") : `دلوقتي ${num(t.current)}`, x, y + 45, w, {
      size: 9.5,
      color: kept ? C.good : C.body,
      bold: kept,
      align: "center",
      leading: 1.2,
    });
  });
  return y + h + 14;
};

// Where the month's marks went: each column over every subject, as a bar of
// what was earned and what was lost, the biggest loss first.
const lostMarks = (doc, r, y) => {
  const list = [...(r.lost || [])].filter((l) => l.possible).sort((a, b) => b.lost - a.lost);
  if (!list.length) return y;
  y = sectionTitle(doc, "الدرجات اللي ضاعت منك فين", y);
  const labelW = 110;
  const noteW = 120;
  const barW = W - labelW - noteW - 20;
  // The bar is what was lost, out of what there was; the rest stays grey.
  list.forEach((l) => {
    const share = Math.max(0, Math.min(1, l.lost / l.possible));
    const tone = toneOf(1 - share, 1);
    write(doc, l.label, PAGE_W - M - labelW, y + 1, labelW, { size: 11, bold: true, color: C.ink, leading: 1.3 });
    const bx = M + noteW + 10;
    doc.roundedRect(bx, y + 3, barW, 14, 4).fill(C.head);
    if (share > 0) doc.roundedRect(bx + barW * (1 - share), y + 3, Math.max(4, barW * share), 14, 4).fill(tone.ink);
    write(doc, l.lost ? `ضاع ${num(l.lost)} من ${l.possible}` : `كاملة ${l.possible} من ${l.possible}`, M, y + 1, noteW, {
      size: 10.5,
      bold: true,
      color: l.lost ? tone.ink : C.good,
      align: "left",
      leading: 1.3,
    });
    y += 24;
  });
  return y + 12;
};

// The month week by week over all subjects, oldest on the right.
const weekTrend = (doc, r, y) => {
  const weeks = r.weekTrend || [];
  if (!weeks.some((w) => w.percent !== null)) return y;
  y = sectionTitle(doc, "شهرك أسبوع بأسبوع", y);
  const h = 92;
  const slot = W / weeks.length;
  const barW = 54;
  const base = y + h - 22;
  const full = h - 40;
  doc.lineWidth(0.6).strokeColor(C.grid).moveTo(M, base).lineTo(PAGE_W - M, base).stroke();
  weeks.forEach((w, i) => {
    const cx = PAGE_W - M - slot * i - slot / 2;
    if (w.percent !== null) {
      const bh = Math.max(3, (w.percent / 100) * full);
      const tone = toneOf(w.percent, 100);
      doc.roundedRect(cx - barW / 2, base - bh, barW, bh, 4).fill(tone.ink);
      write(doc, `${w.percent}%`, cx - 40, base - bh - 17, 80, { size: 11, bold: true, color: tone.ink, align: "center", leading: 1.2 });
    } else {
      write(doc, "مفيش درجات", cx - 40, base - 18, 80, { size: 9.5, color: C.none, align: "center", leading: 1.2 });
    }
    write(doc, `أسبوع ${dayMonth(w.weekStart)}`, cx - 50, base + 5, 100, { size: 9.5, color: C.body, align: "center", leading: 1.2 });
  });
  return y + h + 12;
};

// The second page opens on a strip saying whose report it is.
const strip = (doc, r) => {
  doc.rect(0, 0, PAGE_W, 40).fill(C.brand);
  write(doc, `تقريري الشهري · ${r.month.label}`, M, 12, W, { size: 12, bold: true, color: C.white, leading: 1.2 });
  write(doc, r.student.name, M, 12, 260, { size: 11, color: C.white, align: "left", leading: 1.2 });
  return 60;
};

const footer = (doc, r) => {
  const y = PAGE_H - 40;
  doc.lineWidth(0.8).strokeColor(C.grid).moveTo(M, y).lineTo(PAGE_W - M, y).stroke();
  const note = r.complete
    ? `الأرقام دي من سجل درجات معلمينك للشهر ده. التقرير اتعمل يوم ${fullDate(r.generatedAt)}.`
    : `الشهر لسه ماخلصش، فالأرقام ممكن تتغير لحد آخره. التقرير اتعمل يوم ${fullDate(r.generatedAt)}.`;
  write(doc, note, M + 60, y + 9, W - 60, { size: 9, color: C.body, leading: 1.3 });
  write(doc, "EduLink", M, y + 8, 60, { size: 10, bold: true, color: C.brand, align: "left", leading: 1.3 });
};

const writeMonthlyReportPdf = (report, stream) => {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `تقريري الشهري - ${report.student.name}` } });
  doc.registerFont("regular", FONTS.regular);
  doc.registerFont("bold", FONTS.bold);
  doc.pipe(stream);

  // Page one is where the student stands; page two, what comes next.
  header(doc, report);
  let y = summary(doc, report, 120);
  y = table(doc, report, y);
  const room = (need) => {
    if (y + need > PAGE_H - 50) {
      footer(doc, report);
      doc.addPage({ size: "A4", margin: 0 });
      y = strip(doc, report);
    }
  };
  room(30 + report.advice.strengths.length * 26);
  y = bullets(doc, report.student.female ? "اللي عملتيه كويس" : "اللي عملته كويس", report.advice.strengths, y);
  room(40 + (report.lost || []).length * 24);
  y = lostMarks(doc, report, y);
  footer(doc, report);

  doc.addPage({ size: "A4", margin: 0 });
  y = strip(doc, report);
  y = weekTrend(doc, report, y);
  y = plan(doc, report, y);
  room(100);
  y = targets(doc, report, y);
  footer(doc, report);
  doc.end();
};

module.exports = { writeMonthlyReportPdf };
