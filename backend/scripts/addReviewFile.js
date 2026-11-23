// Puts a revision file in «ملفات المراجعة» on the واجباتي page of every
// student in the grades named (models/ReviewFile.js). The file itself goes
// in frontend/public/booklets and is pushed first, so the link already works:
// this checks it before writing. Run again with the same title, it updates
// that file in place instead of adding a second.
//
//   node scripts/addReviewFile.js <school name part> <grade name part> <subject name | -> "<title>" <https url> ["<note>"] [--dry] [--hide]
//   e.g. node scripts/addReviewFile.js فيوتشر "الاول الاعدادي" "لغة عربية" "مذكرة بوصلة: مراجعة اللغة العربية لاختبار نوفمبر" https://…/booklets/x.pdf "١٨ بطاقة"
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const School = require("../src/models/School");
const Grade = require("../src/models/Grade");
const Subject = require("../src/models/Subject");
const ReviewFile = require("../src/models/ReviewFile");

(async () => {
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const [schoolPart, gradePart, subjectName, title, url, note = ""] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!schoolPart || !gradePart || !subjectName || !title || !url) {
    console.log('usage: node scripts/addReviewFile.js <school> <grade> <subject|-> "<title>" <url> ["<note>"] [--dry] [--hide]');
    process.exit(1);
  }

  const served = await fetch(url, { method: "HEAD" });
  const type = served.headers.get("content-type") || "";
  if (!served.ok || /text\/html/.test(type)) throw new Error(`the link doesn't serve the file yet: ${served.status} ${type}`);

  await mongoose.connect(process.env.MONGO_URI);
  console.log("database:", mongoose.connection.host, mongoose.connection.name);
  const school = await School.findOne({ name: new RegExp(schoolPart) }).select("name");
  if (!school) throw new Error(`no school matching ${schoolPart}`);
  const grades = (await Grade.find({ school: school._id }).select("name")).filter((g) => g.name.includes(gradePart));
  if (!grades.length) throw new Error(`no grade matching ${gradePart}`);
  const subject = subjectName === "-" ? null : await Subject.findOne({ school: school._id, name: subjectName }).select("name");
  if (subjectName !== "-" && !subject) throw new Error(`no subject named ${subjectName}`);

  console.log("school:", school.name);
  console.log("grades:", grades.map((g) => g.name).join(" | "));
  console.log("subject:", subject ? subject.name : "(none)");
  console.log("file:", served.status, type, served.headers.get("content-length") || "");

  const doc = {
    school: school._id,
    grades: grades.map((g) => g._id),
    subject: subject?._id || null,
    title,
    note,
    url,
    published: !flags.includes("--hide"),
  };
  await new ReviewFile(doc).validate();
  if (flags.includes("--dry")) {
    console.log("dry run: valid, nothing written");
  } else {
    const existing = await ReviewFile.findOne({ school: school._id, title });
    if (existing) {
      existing.set(doc);
      await existing.save();
      console.log("updated", String(existing._id), "published:", existing.published);
    } else {
      const made = await ReviewFile.create(doc);
      console.log("created", String(made._id), "published:", made.published);
    }
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect();
  process.exit(1);
});
