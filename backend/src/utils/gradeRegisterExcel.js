const ExcelJS = require("exceljs");

// Mirrors the paper "سجل رصد درجات فصل" register the school already uses on
// paper — weeks (or a month's worth of weeks) as column groups, students as
// rows — but built from the system's own live data instead of copied out by
// hand. Only the categories the system actually tracks per week are
// included (حضور ومواظبة، تقييم أسبوعي، واجب منزلي); كراسة النشاط/الأداء
// الصفي have no digital source yet (see courseworkController) so they're
// left off rather than printed as permanently-empty columns.
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
    "الاسم",
    "حضور ومواظبة (5)",
    "تقييم أسبوعي (10)",
    "واجب منزلي (5)",
    "الإجمالي (20)",
  ];

  sheet.columns = columns.map((_, i) => ({ width: i === 0 ? 28 : 18 }));

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `سجل رصد درجات فصل ${classroomName} — مادة ${subjectName} — أسبوع ${formatDateAr(weekStart)}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: "center" };
  sheet.getRow(1).height = 26;

  const headerRow = sheet.getRow(2);
  columns.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    styleHeaderCell(cell);
  });
  headerRow.height = 26;

  students.forEach((student, index) => {
    const row = sheet.getRow(index + 3);
    const entry = scores[student._id.toString()] || {};
    const values = [
      `${student.firstName} ${student.lastName}`,
      entry.attendanceScore ?? "-",
      entry.weeklyEvalScore ?? "-",
      entry.homeworkScore ?? "-",
      entry.total ?? "-",
    ];

    values.forEach((value, i) => {
      const cell = row.getCell(i + 1);
      cell.value = value;
      styleDataCell(cell, { bold: i === 0 || i === values.length - 1 });
    });

    row.height = 20;
  });

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

  const subCols = ["حضور", "تقييم", "واجب", "إجمالي"];
  // RTL layout, rightmost first: الاسم | week1(4) | week2(4) | ... |
  // متوسط الأسابيع(4) | الجموع
  const totalCols = 1 + weekStarts.length * subCols.length + subCols.length + 1;

  sheet.columns = Array.from({ length: totalCols }, (_, i) => ({
    width: i === 0 ? 26 : 11,
  }));

  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `سجل رصد درجات فصل ${classroomName} — مادة ${subjectName} — شهر ${MONTH_NAMES[month]} ${year}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: "center" };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 3, 1);
  const nameCell = sheet.getCell(2, 1);
  nameCell.value = "الاسم";
  styleHeaderCell(nameCell);

  let col = 2;
  weekStarts.forEach((weekStart, wIdx) => {
    sheet.mergeCells(2, col, 2, col + subCols.length - 1);
    const groupCell = sheet.getCell(2, col);
    groupCell.value = `الأسبوع ${wIdx + 1} (${formatDateAr(weekStart)})`;
    styleHeaderCell(groupCell);

    subCols.forEach((label, i) => {
      const cell = sheet.getCell(3, col + i);
      cell.value = label;
      styleHeaderCell(cell);
    });

    col += subCols.length;
  });

  sheet.mergeCells(2, col, 2, col + subCols.length - 1);
  const avgGroupCell = sheet.getCell(2, col);
  avgGroupCell.value = "متوسط الأسابيع";
  styleHeaderCell(avgGroupCell);

  subCols.forEach((label, i) => {
    const cell = sheet.getCell(3, col + i);
    cell.value = label;
    styleHeaderCell(cell);
  });
  col += subCols.length;

  sheet.mergeCells(2, col, 3, col);
  const totalHeaderCell = sheet.getCell(2, col);
  totalHeaderCell.value = "الجموع";
  styleHeaderCell(totalHeaderCell);

  sheet.getRow(2).height = 26;
  sheet.getRow(3).height = 20;

  students.forEach((student, sIdx) => {
    const key = student._id.toString();
    const row = sheet.getRow(sIdx + 4);
    let c = 1;

    const nameCell = row.getCell(c++);
    nameCell.value = `${student.firstName} ${student.lastName}`;
    styleDataCell(nameCell, { bold: true });

    const attendanceValues = [];
    const weeklyEvalValues = [];
    const homeworkValues = [];
    const perWeekTotals = [];

    weeklyScores.forEach(({ scores }) => {
      const entry = scores[key] || {};

      [
        entry.attendanceScore,
        entry.weeklyEvalScore,
        entry.homeworkScore,
        entry.total,
      ].forEach((value) => {
        const cell = row.getCell(c++);
        cell.value = value ?? "-";
        styleDataCell(cell);
      });

      attendanceValues.push(entry.attendanceScore);
      weeklyEvalValues.push(entry.weeklyEvalScore);
      homeworkValues.push(entry.homeworkScore);
      perWeekTotals.push(entry.total);
    });

    const avgTotal = average(perWeekTotals);

    [
      average(attendanceValues),
      average(weeklyEvalValues),
      average(homeworkValues),
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

  return workbook;
};
