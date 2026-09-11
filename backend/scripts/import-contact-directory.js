// One-time (repeatable) load of the school's household-contact spreadsheet
// (اولياء الامور.xlsx — one sheet per grade: الاسم / محل الاقامة /
// تليفون الاب / تليفون الام) into ContactDirectory, so the student
// registration screen can look a child's name up and offer the parent's
// phone instead of it being typed blind or hunted for by hand.
//
// Usage: node scripts/import-contact-directory.js "<path to xlsx>" [schoolName]
// schoolName defaults to the first school that already has grades/classrooms
// set up (there is currently only one school in real use).
//
// Idempotent: upserts on {school, normalizedName}, so re-running after the
// spreadsheet is corrected just updates the existing rows instead of
// duplicating them.
require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

const { normalizeArabicName } = require("../src/utils/arabicName");
const ContactDirectory = require("../src/models/ContactDirectory");
const School = require("../src/models/School");
const Grade = require("../src/models/Grade");

const cleanPhone = (value) => {
  const s = String(value ?? "").trim();
  if (!s || s === "-" || s === "0") return "";
  return s;
};

const run = async () => {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("usage: node scripts/import-contact-directory.js <path.xlsx> [schoolName]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  let school = null;
  if (process.argv[3]) {
    school = await School.findOne({ name: new RegExp(process.argv[3]) });
  } else {
    for (const candidate of await School.find()) {
      const hasGrades = await Grade.exists({ school: candidate._id });
      if (hasGrades) {
        school = candidate;
        break;
      }
    }
  }

  if (!school) {
    console.error("no matching school found");
    process.exit(1);
  }
  console.log(`school: ${school.name}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(filePath));

  let imported = 0;
  let updated = 0;

  for (const sheet of wb.worksheets) {
    const gradeLabel = String(sheet.getRow(1).getCell(1).value || sheet.name).trim();
    let sheetCount = 0;

    for (let r = 3; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const name = row.getCell(1).value;
      if (!name || !String(name).trim()) continue;

      const studentName = String(name).trim();
      const doc = {
        school: school._id,
        studentName,
        normalizedName: normalizeArabicName(studentName),
        address: row.getCell(2).value ? String(row.getCell(2).value).trim() : "",
        fatherPhone: cleanPhone(row.getCell(3).value),
        motherPhone: cleanPhone(row.getCell(4).value),
        gradeLabel,
      };

      // eslint-disable-next-line no-await-in-loop -- a few hundred rows, run
      // once by a human; sequential keeps the upsert-count bookkeeping simple.
      const result = await ContactDirectory.updateOne(
        { school: school._id, normalizedName: doc.normalizedName },
        { $set: doc },
        { upsert: true },
      );

      if (result.upsertedCount > 0) imported += 1;
      else updated += 1;
      sheetCount += 1;
    }

    console.log(`${gradeLabel}: ${sheetCount} rows`);
  }

  console.log(`\nnew records: ${imported}`);
  console.log(`existing records refreshed: ${updated}`);
  console.log(`total in directory now: ${await ContactDirectory.countDocuments({ school: school._id })}`);

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("import failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
