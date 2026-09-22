// Loads a school's new-admissions sheet ("اخطار عن قيد تلاميذ مستجدين")
// into AdmissionCandidate, so the registration form can search a child by
// name and fill itself in. See src/models/AdmissionCandidate.js.
//
// Usage:
//   node scripts/import-admission-candidates.js "<path.xlsx>" "<school name>" [--dry-run]
//
// The school must be named — there is no "first school" default, so a
// sheet can never land in another school's list by accident. Each sheet is
// matched to one of that school's grades by the sheet's own name ("عربي"
// → "الصف الاول الاعدادي عربي"); a sheet that matches none (or several) is
// reported and skipped, not guessed.
//
// Re-runnable: rows upsert on {school, grade, normalized name}, so a
// corrected sheet updates what's there. A child already registered keeps
// its registration — only the sheet's data columns are refreshed.
// Households and each household's shared number are recomputed over the
// school's whole list after every run, because a sibling can sit in
// another sheet (or another run).
require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

const AdmissionCandidate = require("../src/models/AdmissionCandidate");
const School = require("../src/models/School");
const Grade = require("../src/models/Grade");
const User = require("../src/models/User");
const { normalizeArabicName } = require("../src/utils/arabicName");
const { extractMobiles } = require("../src/utils/phone");
const { cleanName, splitName, assignHouseholds } = require("../src/utils/admissionRoster");

// The sheet's column headers, as written on the ministry forms. Located by
// header text rather than by position, so a school that inserts or moves a
// column doesn't silently shift every field. Each field lists the wordings
// seen so far — the new-admissions notice and the enrolment register
// (سجل قيد التلاميذ) name the same columns differently.
const HEADERS = {
  serial: ["م"],
  studentName: ["اسم الطالب", "اسم التلميذ"],
  gender: ["النوع"],
  religion: ["الديانه"],
  birthDate: ["تاريخ الميلاد"],
  nationalId: ["الرقم القومى", "الرقم القومى للتلميذ"],
  nationality: ["الجنسية"],
  address: ["العنوان", "محل الاقامة"],
  parentName: ["اسم ولى الامر"],
  parentJob: ["صناعة الوالد", "صناعته"],
  phone: ["رقم التليفون"],
};

const fold = (value) => normalizeArabicName(value).replace(/\s+/g, "");
const words = (value) => normalizeArabicName(value).split(/[^ء-ي]+/).filter(Boolean);

const cellText = (cell) => {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v.text) return String(v.text);
  }
  return String(v);
};

const cellDate = (cell) => {
  const v = cell.value;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000));
  return undefined;
};

const genderOf = (text) => {
  const g = fold(text);
  if (g.startsWith("ذكر")) return "male";
  if (g.startsWith("انث")) return "female";
  return undefined;
};

const findHeaderRow = (sheet) => {
  for (let r = 1; r <= Math.min(sheet.rowCount, 15); r += 1) {
    const row = sheet.getRow(r);
    const columns = {};
    row.eachCell((cell, col) => {
      const text = fold(cellText(cell));
      for (const [key, headers] of Object.entries(HEADERS)) {
        // First match wins: the register repeats "تاريخ الميلاد" further
        // right as a split day/month/year helper.
        if (!columns[key] && headers.some((h) => text === fold(h))) columns[key] = col;
      }
    });
    if (columns.studentName && columns.phone) return { row: r, columns };
  }
  return null;
};

const run = async () => {
  const [filePath, schoolName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");

  if (!filePath || !schoolName) {
    console.error(
      'usage: node scripts/import-admission-candidates.js "<path.xlsx>" "<school name>" [--dry-run]',
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
  const grades = await Grade.find({ school: school._id });
  console.log(`school: ${school.name}${dryRun ? "   (dry run — nothing written)" : ""}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(filePath));

  const rows = [];

  for (const sheet of wb.worksheets) {
    const header = findHeaderRow(sheet);
    if (!header) {
      if (sheet.actualRowCount > 1) console.log(`[${sheet.name}] no header row found — skipped`);
      continue;
    }

    const { columns } = header;
    // The header cells are merged down over the rows beneath them, and a
    // merged cell reads as its top cell's text — so those rows would come
    // back named "اسم التلميذ". Only a cell that is its own master is data.
    const nameAt = (r) => {
      const cell = sheet.getRow(r).getCell(columns.studentName);
      if (cell.isMerged && cell.master.address !== cell.address) return "";
      return cellText(cell).trim();
    };
    let hasData = false;
    for (let r = header.row + 1; r <= sheet.rowCount && !hasData; r += 1) hasData = !!nameAt(r);
    if (!hasData) {
      console.log(`[${sheet.name}] no students — skipped`);
      continue;
    }

    // Which grade the sheet is for: the grade whose every word (after
    // "الصف") appears in the sheet's name or its title rows — "كشوف الصف
    // الثانى الاعدادي(عربي )" is "الصف الثاني الاعدادي عربي". The title is
    // needed because a sheet's name may leave the track out ("الثانى
    // الاعدادى"); exactly one grade must fit, never a best guess.
    const context = new Set(words(sheet.name));
    for (let r = 1; r < header.row; r += 1) {
      sheet.getRow(r).eachCell((cell) => words(cellText(cell)).forEach((w) => context.add(w)));
    }
    const matches = grades.filter((g) =>
      words(g.name).filter((w) => w !== "الصف").every((w) => context.has(w)),
    );
    if (matches.length !== 1) {
      console.log(
        `[${sheet.name}] matches ${matches.length} grades of this school (need exactly 1) — skipped`,
      );
      continue;
    }
    const grade = matches[0];
    let count = 0;

    // Data starts under the header block (one or two more rows split the
    // age into يوم / شهر / سنه); those rows carry no name and are skipped.
    for (let r = header.row + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const text = (key) => (columns[key] ? cellText(row.getCell(columns[key])).trim() : "");

      const studentName = cleanName(nameAt(r));
      if (!studentName) continue;

      const parentName = cleanName(text("parentName"));
      const rawPhone = text("phone");
      const { valid, invalid } = extractMobiles(rawPhone);
      const serial = Number(text("serial"));

      rows.push({
        school: school._id,
        grade: grade._id,
        sheetLabel: sheet.name.replace(/ـ/g, "").trim(),
        serial: Number.isFinite(serial) ? serial : undefined,
        studentName,
        normalizedName: normalizeArabicName(studentName),
        ...splitName(studentName),
        gender: genderOf(text("gender")),
        religion: text("religion"),
        birthDate: columns.birthDate ? cellDate(row.getCell(columns.birthDate)) : undefined,
        nationalId: text("nationalId").replace(/\D/g, ""),
        nationality: text("nationality"),
        address: text("address"),
        parentName,
        parentFirstName: splitName(parentName).firstName,
        parentLastName: splitName(parentName).lastName,
        parentJob: text("parentJob"),
        rawPhone,
        phones: valid,
        invalidPhones: invalid,
      });
      count += 1;
    }

    console.log(`[${sheet.name}] → ${grade.name}: ${count} students`);
  }

  // Report what a person has to look at before registration day.
  const noPhone = rows.filter((r) => !r.phones.length);
  const unreadable = rows.filter((r) => r.invalidPhones.length);
  const noGender = rows.filter((r) => !r.gender);
  const dupes = rows.filter(
    (r, i) => rows.findIndex((o) => String(o.grade) === String(r.grade) && o.normalizedName === r.normalizedName) !== i,
  );

  if (noPhone.length) {
    console.log(`\nno usable mobile number (${noPhone.length}):`);
    noPhone.forEach((r) => console.log(`  ${r.sheetLabel} #${r.serial} ${r.studentName}: "${r.rawPhone}"`));
  }
  if (unreadable.length) {
    console.log(`\nnumbers that aren't a valid mobile, left out (${unreadable.length}):`);
    unreadable.forEach((r) =>
      console.log(`  ${r.sheetLabel} #${r.serial} ${r.studentName}: ${r.invalidPhones.join(", ")}`),
    );
  }
  if (noGender.length) {
    console.log(`\nno readable gender (${noGender.length}):`);
    noGender.forEach((r) => console.log(`  ${r.sheetLabel} #${r.serial} ${r.studentName}`));
  }
  if (dupes.length) {
    console.log(`\nsame name twice in one grade — only the last row is kept (${dupes.length}):`);
    dupes.forEach((r) => console.log(`  ${r.sheetLabel} #${r.serial} ${r.studentName}`));
  }

  // A number already registered to a parent at ANOTHER school can't be
  // used here (a parent account belongs to one school), so warn now.
  const allPhones = [...new Set(rows.flatMap((r) => r.phones))];
  const elsewhere = await User.find({
    role: "parent",
    phoneNumber: { $in: allPhones },
    school: { $ne: school._id },
  }).select("phoneNumber");
  // Children whose family is already registered here (a brother or
  // sister in another grade) — the form will link them to that account.
  const known = new Set(
    (
      await User.find({ role: "parent", school: school._id, phoneNumber: { $in: allPhones } }).select(
        "phoneNumber",
      )
    ).map((u) => u.phoneNumber),
  );
  const joining = rows.filter((r) => r.phones.some((p) => known.has(p)));
  if (joining.length) {
    console.log(`\nfamily already registered at this school — will join that parent account (${joining.length}):`);
    joining.forEach((r) =>
      console.log(`  ${r.sheetLabel} #${r.serial} ${r.studentName} → ${r.phones.find((p) => known.has(p))}`),
    );
  }
  if (elsewhere.length) {
    console.log(`\nnumbers already used by a parent at another school (${elsewhere.length}) — skipped when picking the shared number:`);
    elsewhere.forEach((u) => console.log(`  ${u.phoneNumber}`));
  }

  if (dryRun) {
    const preview = assignHouseholds(
      rows.map((r, i) => ({ key: i, phones: r.phones })),
    );
    printHouseholds(rows.map((r, i) => ({ ...r, ...preview.get(i) })));
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let refreshed = 0;
  for (const doc of rows) {
    // eslint-disable-next-line no-await-in-loop -- a few hundred rows, run
    // by a human; sequential keeps the counts simple.
    const result = await AdmissionCandidate.updateOne(
      { school: doc.school, grade: doc.grade, normalizedName: doc.normalizedName },
      { $set: doc },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1;
    else refreshed += 1;
  }

  // Households over the school's whole list, not just this file.
  const everyone = await AdmissionCandidate.find({ school: school._id }).sort({ grade: 1, serial: 1 });
  const taken = new Set(elsewhere.map((u) => u.phoneNumber));
  const households = assignHouseholds(
    everyone.map((c) => ({ key: String(c._id), phones: c.phones.filter((p) => !taken.has(p)) })),
  );
  await AdmissionCandidate.bulkWrite(
    everyone.map((c) => ({
      updateOne: { filter: { _id: c._id }, update: { $set: households.get(String(c._id)) } },
    })),
  );

  const saved = await AdmissionCandidate.find({ school: school._id }).sort({ grade: 1, serial: 1 });
  printHouseholds(saved);

  console.log(`\nnew: ${created}   refreshed: ${refreshed}`);
  console.log(
    `in this school's list now: ${saved.length} (${saved.filter((c) => !c.registeredStudent).length} not yet registered)`,
  );

  await mongoose.disconnect();
};

const printHouseholds = (list) => {
  const byHousehold = new Map();
  for (const c of list) {
    if (!c.household) continue;
    if (!byHousehold.has(c.household)) byHousehold.set(c.household, []);
    byHousehold.get(c.household).push(c);
  }
  const shared = [...byHousehold.values()].filter((g) => g.length > 1);
  console.log(`\nsiblings sharing one number (${shared.length} households):`);
  for (const group of shared) {
    console.log(`  ${group[0].primaryPhone}`);
    group.forEach((c) => console.log(`    ${c.sheetLabel} · ${c.studentName}  [${c.phones.join(" ")}]`));
  }
};

run().catch(async (err) => {
  console.error("import failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
