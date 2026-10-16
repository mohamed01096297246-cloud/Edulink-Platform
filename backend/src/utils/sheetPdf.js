const path = require("path");
const PDFDocument = require("pdfkit");
const bidiFactory = require("bidi-js");

// Draws an ExcelJS worksheet as a PDF that looks like the sheet: the same
// columns and widths, merged cells, header fill, borders, bold and alignment.
// The grade register is built once, as a workbook (utils/gradeRegisterExcel),
// and printed either way — so the PDF a phone opens is the Excel design, not
// a second layout that could drift from it.
//
// Arabic needs two things pdfkit doesn't do on its own: the bidi algorithm
// (an Arabic line with numbers in it — "أسبوع 2026/10/11" — reads right to
// left with the number left to right inside it), and drawing each word on
// its own, which is what lets fontkit join the letters without losing the
// spaces between words.

const bidi = bidiFactory();

const FONTS = {
  regular: path.join(__dirname, "../assets/fonts/Tajawal-Regular.ttf"),
  bold: path.join(__dirname, "../assets/fonts/Tajawal-Bold.ttf"),
};

const PAGE = { portrait: [595.28, 841.89], landscape: [841.89, 595.28] };
const MARGIN = 24;
// An Excel column width is in characters; about 6pt each prints the same
// proportions.
const POINTS_PER_CHAR = 6;
const DEFAULT_ROW_HEIGHT = 20;
const CELL_PADDING = 3;
const MIN_FONT = 5;

// A line of text as runs in visual order (left to right on the page). Each
// run is one word, number or other unbroken stretch, in the order its
// characters must be handed to the font: an Arabic word in its own logical
// order (the font joins and lays it out right to left itself), anything
// left-to-right as written.
const visualRuns = (text) => {
  const levels = bidi.getEmbeddingLevels(text, "rtl");
  const order = [...text].map((_, i) => i);
  bidi.getReorderSegments(text, levels).forEach(([start, end]) => {
    const slice = order.slice(start, end + 1).reverse();
    order.splice(start, slice.length, ...slice);
  });
  const runs = [];
  let current = null;
  order.forEach((i) => {
    // A bracket inside right-to-left text faces the other way: "(5)" after
    // an Arabic word keeps its shape on the page only if each side swaps.
    const ch = (levels.levels[i] % 2 === 1 && bidi.getMirroredCharacter(text[i])) || text[i];
    if (ch === " ") {
      current = null;
      runs.push({ space: true });
      return;
    }
    const rtl = levels.levels[i] % 2 === 1;
    if (!current || current.rtl !== rtl) {
      current = { rtl, chars: [] };
      runs.push(current);
    }
    current.chars.push(ch);
  });

  return runs.map((run) =>
    run.space
      ? run
      : { text: run.rtl ? run.chars.reverse().join("") : run.chars.join("") },
  );
};

const runsWidth = (doc, runs) => {
  const space = doc.widthOfString(" ");
  return runs.reduce((w, run) => w + (run.space ? space : doc.widthOfString(run.text)), 0);
};

const drawRuns = (doc, runs, x, y) => {
  const space = doc.widthOfString(" ");
  let cursor = x;
  runs.forEach((run) => {
    if (run.space) {
      cursor += space;
      return;
    }
    doc.text(run.text, cursor, y, { lineBreak: false });
    cursor += doc.widthOfString(run.text);
  });
};

const argbToHex = (argb) => (argb && argb.length === 8 ? `#${argb.slice(2)}` : null);

// The text lines a cell prints, at the largest size (up to its own) that
// fits the cell: one line, or — for a cell that wraps — as many as it has
// room for.
const layoutText = (doc, text, width, height, size, wrap) => {
  for (let s = size; s >= MIN_FONT; s -= 0.5) {
    doc.fontSize(s);
    const lineHeight = s * 1.25;
    const single = visualRuns(text);
    if (runsWidth(doc, single) <= width) return { size: s, lines: [single], lineHeight };
    if (!wrap) continue;

    const words = text.split(/\s+/).filter(Boolean);
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
    const fits =
      lines.length * lineHeight <= height &&
      lines.every((l) => runsWidth(doc, visualRuns(l)) <= width);
    if (fits) return { size: s, lines: lines.map(visualRuns), lineHeight };
  }
  doc.fontSize(MIN_FONT);
  return { size: MIN_FONT, lines: [visualRuns(text)], lineHeight: MIN_FONT * 1.25 };
};

const cellText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.richText) return value.richText.map((p) => p.text).join("");
  return String(value);
};

// Writes the worksheet as a PDF to `stream` (a response, usually). Wide
// sheets turn landscape and are scaled down to the page width; long ones
// carry on over more pages, repeating the table's heading rows.
const writeSheetPdf = (sheet, stream) => {
  const columnCount = sheet.columnCount;
  const rowCount = sheet.rowCount;
  const rtl = Boolean(sheet.views?.[0]?.rightToLeft);

  const widths = Array.from({ length: columnCount }, (_, i) => (sheet.getColumn(i + 1).width || 10) * POINTS_PER_CHAR);
  const tableWidth = widths.reduce((a, b) => a + b, 0);
  const layout = tableWidth > PAGE.portrait[0] - 2 * MARGIN ? "landscape" : "portrait";
  const [pageWidth, pageHeight] = PAGE[layout];
  const scale = Math.min(1, (pageWidth - 2 * MARGIN) / tableWidth);

  // Left edge of each column on the page; a right-to-left sheet puts column
  // 1 at the right.
  const left = [];
  let edge = (pageWidth - tableWidth * scale) / 2;
  const orderedCols = rtl ? [...widths.keys()].reverse() : [...widths.keys()];
  orderedCols.forEach((i) => {
    left[i] = edge;
    edge += widths[i] * scale;
  });

  const heights = Array.from({ length: rowCount }, (_, i) => (sheet.getRow(i + 1).height || DEFAULT_ROW_HEIGHT) * scale);

  // Merged ranges by their top-left cell; every other cell they cover is
  // skipped.
  const merges = new Map();
  const covered = new Set();
  Object.values(sheet._merges || {}).forEach((range) => {
    const { top, left: l, bottom, right } = range.model || range;
    merges.set(`${top}:${l}`, { top, left: l, bottom, right });
    for (let r = top; r <= bottom; r += 1) {
      for (let c = l; c <= right; c += 1) if (r !== top || c !== l) covered.add(`${r}:${c}`);
    }
  });

  // The table's heading rows — the filled ones — repeat on every page.
  const isHeadingRow = (rowNumber) => {
    const row = sheet.getRow(rowNumber);
    for (let c = 1; c <= columnCount; c += 1) if (row.getCell(c).fill?.fgColor?.argb) return true;
    return false;
  };
  const headingRows = Array.from({ length: rowCount }, (_, i) => i + 1).filter(isHeadingRow);

  const doc = new PDFDocument({ size: "A4", layout, margin: MARGIN, autoFirstPage: true });
  doc.registerFont("regular", FONTS.regular);
  doc.registerFont("bold", FONTS.bold);
  doc.pipe(stream);

  const drawRow = (rowNumber, y) => {
    const row = sheet.getRow(rowNumber);
    for (let c = 1; c <= columnCount; c += 1) {
      if (covered.has(`${rowNumber}:${c}`)) continue;
      const cell = row.getCell(c);
      const merge = merges.get(`${rowNumber}:${c}`);
      const lastRow = merge ? merge.bottom : rowNumber;
      const lastCol = merge ? merge.right : c;

      const xs = [];
      for (let k = c; k <= lastCol; k += 1) xs.push(left[k - 1], left[k - 1] + widths[k - 1] * scale);
      const x = Math.min(...xs);
      const w = Math.max(...xs) - x;
      let h = 0;
      for (let k = rowNumber; k <= lastRow; k += 1) h += heights[k - 1];

      const fill = argbToHex(cell.fill?.fgColor?.argb);
      if (fill) doc.rect(x, y, w, h).fill(fill);
      if (cell.border?.top || cell.border?.bottom || cell.border?.left || cell.border?.right) {
        doc.lineWidth(0.6).strokeColor("#000000").rect(x, y, w, h).stroke();
      }

      const text = cellText(cell.value);
      if (!text) continue;
      const font = cell.font || {};
      doc.font(font.bold ? "bold" : "regular").fillColor(argbToHex(font.color?.argb) || "#000000");
      const align = cell.alignment?.horizontal || (typeof cell.value === "number" ? "center" : rtl ? "right" : "left");
      const { lines, lineHeight } = layoutText(
        doc,
        text,
        w - 2 * CELL_PADDING,
        h - 2,
        (font.size || 11) * scale,
        Boolean(cell.alignment?.wrapText),
      );
      const blockHeight = lines.length * lineHeight;
      let ty = y + (h - blockHeight) / 2 + lineHeight * 0.12;
      lines.forEach((runs) => {
        const lw = runsWidth(doc, runs);
        const tx =
          align === "center" ? x + (w - lw) / 2 : align === "left" ? x + CELL_PADDING : x + w - CELL_PADDING - lw;
        drawRuns(doc, runs, tx, ty);
        ty += lineHeight;
      });
    }
  };

  // A merged block spanning several rows must stay on one page.
  const blockEnd = (rowNumber) => {
    let end = rowNumber;
    merges.forEach((m) => {
      if (m.top === rowNumber && m.bottom > end) end = m.bottom;
    });
    return end;
  };

  let y = MARGIN;
  let rowNumber = 1;
  while (rowNumber <= rowCount) {
    const end = blockEnd(rowNumber);
    let blockHeight = 0;
    for (let k = rowNumber; k <= end; k += 1) blockHeight += heights[k - 1];

    if (y + blockHeight > pageHeight - MARGIN && y > MARGIN) {
      doc.addPage({ size: "A4", layout, margin: MARGIN });
      y = MARGIN;
      if (!headingRows.includes(rowNumber)) {
        headingRows.forEach((h) => {
          drawRow(h, y);
          y += heights[h - 1];
        });
      }
    }

    for (let k = rowNumber; k <= end; k += 1) {
      drawRow(k, y);
      y += heights[k - 1];
    }
    rowNumber = end + 1;
  }

  doc.end();
};

module.exports = { writeSheetPdf, visualRuns };
