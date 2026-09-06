const ExcelJS = require("exceljs");

// Mirrors the paper "سجل رصد درجات فصل" register the school already uses on
// paper — weeks (or a month's worth of weeks) as column groups, students as
// rows — but built from the system's own live data instead of copied out by
// hand. Covers the four categories the system tracks per week: مواظبة
// وسلوك، تقييم أسبوعي، واجب منزلي، كراسة الحصة.
const MONTH_NAMES = [
  "",
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A8A" },
};
const HEADER_FONT = { color: { argb: "FFFFFFFF" }, bold: true };
const THIN_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const formatDateAr = (date) => {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
};

const baseSheet = (workbook, title) =>
  workbook.addWorksheet(title, { views: [{ rightToLeft: true }] });

// The fixed wording carried by the school's own paper register, so a
// printed export can be filed and signed exactly like the handwritten one.
// The directorate line is left blank because the system doesn't hold it —
// better an obvious blank to fill in by hand than a wrong name in print.
const SIGNATURE_LABELS = ["معلم المادة", "موجه المادة", "مدير المدرسة"];

// A classroom is often already named "فصل 1/1", so blindly prefixing the
// label produced "فصل فصل 1/1" in print.
const withLabel = (label, value) => {
  const text = (value || "").trim();

  if (!text) return `${label} ....................`;

  return text.startsWith(label) ? text : `${label} ${text}`;
};

// A blank the teacher fills in by hand.
const BLANK = "....................";

// Writes the two identifying lines above the table and returns the row the
// table itself should start on.
const writeHeaderBlock = (sheet, totalCols, { title, subtitle }) => {
  const line = (rowNumber, value, options = {}) => {
    sheet.mergeCells(rowNumber, 1, rowNumber, totalCols);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = value;
    cell.font = { bold: true, size: options.size || 11 };
    cell.alignment = { horizontal: options.align || "center", vertical: "middle" };
    sheet.getRow(rowNumber).height = options.height || 20;
  };

  line(1, "إدارة .................... التعليمية", { align: "right" });
  line(2, `مدرسة ${BLANK}`, { align: "right" });
  line(3, title, { size: 14, height: 26 });
  line(4, subtitle, { size: 11 });

  return 6;
};

// The three signature lines the paper register ends with — all left blank,
// since they are signed by hand once the sheet is printed.
const writeSignatureBlock = (sheet, totalCols, lastDataRow) => {
  const rowNumber = lastDataRow + 2;
  const row = sheet.getRow(rowNumber);
  const span = Math.max(1, Math.floor(totalCols / SIGNATURE_LABELS.length));

  SIGNATURE_LABELS.forEach((label, index) => {
    const from = index * span + 1;
    const to = index === SIGNATURE_LABELS.length - 1 ? totalCols : from + span - 1;

    if (to > from) sheet.mergeCells(rowNumber, from, rowNumber, to);

    const cell = sheet.getCell(rowNumber, from);
    cell.value = `${label}: ${BLANK}`;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  row.height = 30;
};

const styleHeaderCell = (cell) => {
  cell.fill = HEADER_FILL;
  cell.font = HEADER_FONT;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = THIN_BORDER;
};

const styleDataCell = (cell, { bold = false } = {}) => {
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = THIN_BORDER;
  if (bold) cell.font = { bold: true };
};

const average = (values) => {
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
};

exports.buildWeeklyRegisterWorkbook = ({
  subjectName,
  classroomName,
  weekStart,
  students,
  scores,
}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = baseSheet(workbook, "سجل الأسبوع");

  const columns = [
    "م",
    "الاسم",
    "مواظبة وسلوك (5)",
    "تقييم أسبوعي (10)",
    "واجب منزلي (5)",
    "كراسة الحصة (5)",
    "الإجمالي (25)",
  ];

  sheet.columns = columns.map((_, i) => ({
    width: i === 0 ? 5 : i === 1 ? 28 : 18,
  }));

  const headerRowNumber = writeHeaderBlock(sheet, columns.length, {
    title: `سجل رصد درجات ${withLabel("فصل", classroomName)}`,
    subtitle: `المادة: ${subjectName} — أسبوع ${formatDateAr(weekStart)}`,
  });

  const headerRow = sheet.getRow(headerRowNumber);
  columns.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    styleHeaderCell(cell);
  });
  headerRow.height = 26;

  students.forEach((student, index) => {
    const row = sheet.getRow(headerRowNumber + 1 + index);
    const entry = scores[student._id.toString()] || {};
    const values = [
      index + 1,
      `${student.firstName} ${student.lastName}`,
      entry.attendanceScore ?? "-",
      entry.weeklyEvalScore ?? "-",
      entry.homeworkScore ?? "-",
      entry.classworkScore ?? "-",
      entry.total ?? "-",
    ];

    values.forEach((value, i) => {
      const cell = row.getCell(i + 1);
      cell.value = value;
      styleDataCell(cell, { bold: i === 1 || i === values.length - 1 });
    });

    row.height = 20;
  });

  writeSignatureBlock(sheet, columns.length, headerRowNumber + students.length);

  return workbook;
};

exports.buildMonthlyRegisterWorkbook = ({
  subjectName,
  classroomName,
  month,
  year,
  students,
  weekStarts,
  weeklyScores,
}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = baseSheet(workbook, "سجل الشهر");

  const subCols = ["مواظبة", "تقييم", "واجب", "كراسة", "إجمالي"];
  // RTL layout, rightmost first: م | الاسم | week1(5) | week2(5) | ... |
  // متوسط الأسابيع(5) | المجموع
  const totalCols =
    2 + weekStarts.length * subCols.length + subCols.length + 1;

  sheet.columns = Array.from({ length: totalCols }, (_, i) => ({
    width: i === 0 ? 5 : i === 1 ? 26 : 11,
  }));

  // Two rows of column headings, so the table starts one row lower than the
  // weekly sheet's single header row.
  const headerTop = writeHeaderBlock(sheet, totalCols, {
    title: `سجل رصد درجات ${withLabel("فصل", classroomName)}`,
    subtitle: `المادة: ${subjectName} — شهر ${MONTH_NAMES[month]} ${year}`,
  });
  const headerBottom = headerTop + 1;
  const firstDataRow = headerTop + 2;

  sheet.mergeCells(headerTop, 1, headerBottom, 1);
  const serialCell = sheet.getCell(headerTop, 1);
  serialCell.value = "م";
  styleHeaderCell(serialCell);

  sheet.mergeCells(headerTop, 2, headerBottom, 2);
  const nameCell = sheet.getCell(headerTop, 2);
  nameCell.value = "الاسم";
  styleHeaderCell(nameCell);

  let col = 3;
  weekStarts.forEach((weekStart, wIdx) => {
    sheet.mergeCells(headerTop, col, headerTop, col + subCols.length - 1);
    const groupCell = sheet.getCell(headerTop, col);
    groupCell.value = `الأسبوع ${wIdx + 1} (${formatDateAr(weekStart)})`;
    styleHeaderCell(groupCell);

    subCols.forEach((label, i) => {
      const cell = sheet.getCell(headerBottom, col + i);
      cell.value = label;
      styleHeaderCell(cell);
    });

    col += subCols.length;
  });

  sheet.mergeCells(headerTop, col, headerTop, col + subCols.length - 1);
  const avgGroupCell = sheet.getCell(headerTop, col);
  avgGroupCell.value = "متوسط الأسابيع";
  styleHeaderCell(avgGroupCell);

  subCols.forEach((label, i) => {
    const cell = sheet.getCell(headerBottom, col + i);
    cell.value = label;
    styleHeaderCell(cell);
  });
  col += subCols.length;

  sheet.mergeCells(headerTop, col, headerBottom, col);
  const totalHeaderCell = sheet.getCell(headerTop, col);
  totalHeaderCell.value = "المجموع";
  styleHeaderCell(totalHeaderCell);

  sheet.getRow(headerTop).height = 26;
  sheet.getRow(headerBottom).height = 20;

  students.forEach((student, sIdx) => {
    const key = student._id.toString();
    const row = sheet.getRow(firstDataRow + sIdx);
    let c = 1;

    const serial = row.getCell(c++);
    serial.value = sIdx + 1;
    styleDataCell(serial);

    const nameCell = row.getCell(c++);
    nameCell.value = `${student.firstName} ${student.lastName}`;
    styleDataCell(nameCell, { bold: true });

    const attendanceValues = [];
    const weeklyEvalValues = [];
    const homeworkValues = [];
    const classworkValues = [];
    const perWeekTotals = [];

    weeklyScores.forEach(({ scores }) => {
      const entry = scores[key] || {};

      [
        entry.attendanceScore,
        entry.weeklyEvalScore,
        entry.homeworkScore,
        entry.classworkScore,
        entry.total,
      ].forEach((value) => {
        const cell = row.getCell(c++);
        cell.value = value ?? "-";
        styleDataCell(cell);
      });

      attendanceValues.push(entry.attendanceScore);
      weeklyEvalValues.push(entry.weeklyEvalScore);
      homeworkValues.push(entry.homeworkScore);
      classworkValues.push(entry.classworkScore);
      perWeekTotals.push(entry.total);
    });

    const avgTotal = average(perWeekTotals);

    [
      average(attendanceValues),
      average(weeklyEvalValues),
      average(homeworkValues),
      average(classworkValues),
      avgTotal,
    ].forEach((value) => {
      const cell = row.getCell(c++);
      cell.value = value ?? "-";
      styleDataCell(cell, { bold: true });
    });

    const totalCell = row.getCell(c++);
    totalCell.value = avgTotal ?? "-";
    styleDataCell(totalCell, { bold: true });

    row.height = 20;
  });

  writeSignatureBlock(sheet, totalCols, firstDataRow + students.length - 1);

  return workbook;
};
