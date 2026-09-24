// Loads a school's teacher list into StaffCandidate, so the teacher
// registration form can look a name up and fill itself in — the same way
// new students are registered from the admissions list.
//
// Usage:
//   node scripts/import-staff-candidates.js "<file.docx|file.xlsx>" "<school name>" [--dry-run]
//
// Reads a Word file's tables (the way schools usually hand the list over)
// or an Excel file's sheets. Columns are found by their header text, not
// their position: الاسم, المادة, رقم التليفون are needed; م, الرقم القومي
// and the email are used when present. The school must be named — there is
// no default, so a list can never land in another school.
//
// Re-runnable: rows upsert on {school, normalized name}. A teacher already
// registered from the list stays registered.
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const JSZip = require("jszip");
const ExcelJS = require("exceljs");

const StaffCandidate = require("../src/models/StaffCandidate");
const School = require("../src/models/School");
const User = require("../src/models/User");
const { normalizeArabicName } = require("../src/utils/arabicName");
const { extractMobiles, toLatinDigits } = require("../src/utils/phone");
const { cleanName, splitName } = require("../src/utils/admissionRoster");

const HEADERS = {
  serial: ["م"],
  fullName: ["الاسم", "اسم المعلم", "اسم المعلمة", "الاسم رباعي"],
  subject: ["المادة", "التخصص", "مادة التخصص"],
  phone: ["رقم التليفون", "رقم الموبايل", "رقم الهاتف", "التليفون", "الموبايل"],
  nationalId: ["الرقم القومى", "الرقم القومي"],
  email: ["البريد الالكترونى", "البريد الإلكتروني", "الايميل", "الإيميل", "email"],
};

const fold = (value) => normalizeArabicName(value).replace(/\s+/g, "");

// Each table/sheet as an array of rows of cell text.
const readDocxTables = async (file) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file("word/document.xml").async("string");

  const decode = (s) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  const cellText = (cellXml) =>
    decode((cellXml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join(""))
      .trim();

  return (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).map((table) =>
    (table.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || []).map((row) =>
      (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(cellText),
    ),
  );
};

const readXlsxSheets = async (file) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        cells[col - 1] =
          v === null || v === undefined
            ? ""
            : typeof v === "object" && v.richText
              ? v.richText.map((r) => r.text).join("")
              : String(v.text || v.result || v);
      });
      rows.push(cells.map((c) => c || ""));
    });
    return rows;
  });
};

// Finds the header row in a table and maps each field to its column.
const mapColumns = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const columns = {};
    rows[i].forEach((text, col) => {
      for (const [key, headers] of Object.entries(HEADERS)) {
        if (columns[key] === undefined && headers.some((h) => fold(h) === fold(text))) {
          columns[key] = col;
        }
      }
    });
    if (columns.fullName !== undefined && columns.phone !== undefined) {
      return { headerRow: i, columns };
    }
  }
  return null;
};

const run = async () => {
  const [filePath, schoolName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");

  if (!filePath || !schoolName) {
    console.error(
      'usage: node scripts/import-staff-candidates.js "<file.docx|file.xlsx>" "<school name>" [--dry-run]',
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const schools = await School.find({ name: schoolName.trim() });
  if (schools.length !== 1) {
    console.error(`expected exactly one school named "${schoolName}", found ${schools.length}`);
    process.exit(1);
  }
  const school = schools[0];
  console.log(`school: ${school.name}${dryRun ? "   (dry run — nothing written)" : ""}\n`);

  const file = path.resolve(filePath);
  const tables = file.toLowerCase().endsWith(".docx")
    ? await readDocxTables(file)
    : await readXlsxSheets(file);

  const rows = [];
  tables.forEach((table, t) => {
    const mapped = mapColumns(table);
    if (!mapped) {
      console.log(`[table ${t + 1}] no header row with a name and a phone column — skipped`);
      return;
    }
    const { headerRow, columns } = mapped;
    const at = (row, key) => (columns[key] === undefined ? "" : (row[columns[key]] || "").trim());

    let count = 0;
    for (const row of table.slice(headerRow + 1)) {
      const fullName = cleanName(at(row, "fullName"));
      if (!fullName) continue;

      const rawPhone = at(row, "phone");
      const { valid, invalid } = extractMobiles(rawPhone);
      const serial = Number(toLatinDigits(at(row, "serial")));

      rows.push({
        school: school._id,
        serial: Number.isFinite(serial) ? serial : undefined,
        fullName,
        normalizedName: normalizeArabicName(fullName),
        ...splitName(fullName),
        subjectLabel: at(row, "subject"),
        nationalId: toLatinDigits(at(row, "nationalId")).replace(/\D/g, ""),
        email: at(row, "email").toLowerCase(),
        rawPhone,
        phones: valid,
        invalidPhones: invalid,
      });
      count += 1;
    }
    console.log(`[table ${t + 1}] ${count} teachers`);
  });

  const unreadable = rows.filter((r) => !r.phones.length);
  if (unreadable.length) {
    console.log(`\nno usable mobile number (${unreadable.length}):`);
    unreadable.forEach((r) => console.log(`  #${r.serial} ${r.fullName}: "${r.rawPhone}"`));
  }

  const labels = [...new Set(rows.map((r) => r.subjectLabel).filter(Boolean))];
  console.log(`\nsubjects as written in the file (${labels.length}): ${labels.join(" · ")}`);

  // A phone already on a teacher account can't be registered again (one
  // account per phone per role).
  const taken = await User.find({
    role: "teacher",
    phoneNumber: { $in: rows.flatMap((r) => r.phones) },
  }).select("phoneNumber school");
  if (taken.length) {
    console.log(`\nphones already on a teacher account (${taken.length}):`);
    taken.forEach((u) => console.log(`  ${u.phoneNumber}${String(u.school) === String(school._id) ? "" : " (another school)"}`));
  }

  if (dryRun) {
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let refreshed = 0;
  for (const doc of rows) {
    // eslint-disable-next-line no-await-in-loop -- a few dozen rows, run by
    // a human; sequential keeps the counts simple.
    const result = await StaffCandidate.updateOne(
      { school: doc.school, normalizedName: doc.normalizedName },
      { $set: doc },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1;
    else refreshed += 1;
  }

  const total = await StaffCandidate.countDocuments({ school: school._id });
  const waiting = await StaffCandidate.countDocuments({ school: school._id, registeredUser: null });
  console.log(`\nnew: ${created}   refreshed: ${refreshed}`);
  console.log(`on this school's staff list now: ${total} (${waiting} not yet registered)`);

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("import failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
