// Puts a quiz from a JSON file (scripts/quizzes/*.json) in the classrooms
// named, for «الامتحانات الإلكترونية» in the student app. Run again with the
// same file, it replaces that quiz's questions in place (same title and
// school) rather than adding a second one; students who already took it
// keep their result.
//
//   node scripts/seedQuiz.js <file.json> <school name part> <grade name part> <class,class> [--publish] [--dry]
//   e.g. node scripts/seedQuiz.js scripts/quizzes/arabic-prep2-term1-unit1.json فيوتشر الثاني A,B,C --publish
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const School = require("../src/models/School");
const Classroom = require("../src/models/Classroom");
const Subject = require("../src/models/Subject");
const Quiz = require("../src/models/Quiz");
require("../src/models/Grade");

(async () => {
  const [, , file, schoolPart, gradePart, classList, ...flags] = process.argv;
  if (!file || !schoolPart || !gradePart || !classList) {
    console.log("usage: node scripts/seedQuiz.js <file.json> <school> <grade> <class,class> [--publish] [--dry]");
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  await mongoose.connect(process.env.MONGO_URI);
  console.log("database:", mongoose.connection.host, mongoose.connection.name);

  const school = await School.findOne({ name: new RegExp(schoolPart) }).select("name");
  if (!school) throw new Error(`no school matching ${schoolPart}`);
  const names = classList.split(",").map((s) => s.trim());
  const classes = (await Classroom.find({ school: school._id, name: { $in: names } }).populate("grade", "name"))
    .filter((c) => (c.grade?.name || "").includes(gradePart));
  if (!classes.length) throw new Error("no classrooms matched");
  const subject = await Subject.findOne({
    school: school._id,
    name: new RegExp(spec.subjectName.replace(/^لغة /, "")),
    ...Subject.coveringGrade(classes[0].grade._id),
  }).select("name");

  console.log("school:", school.name);
  console.log("classrooms:", classes.map((c) => `${c.grade.name} ${c.name}`).join(" | "));
  console.log("subject:", subject ? subject.name : "(none linked)");
  console.log("questions:", spec.questions.length);

  const doc = {
    school: school._id,
    title: spec.title,
    subjectName: spec.subjectName,
    subject: subject?._id,
    scope: spec.scope || "",
    classrooms: classes.map((c) => c._id),
    passages: spec.passages || [],
    questions: spec.questions,
    published: flags.includes("--publish"),
  };
  const quiz = new Quiz(doc);
  await quiz.validate();
  if (flags.includes("--dry")) {
    console.log("dry run: valid, nothing written");
  } else {
    const existing = await Quiz.findOne({ school: school._id, title: spec.title });
    if (existing) {
      existing.set(doc);
      await existing.save();
      console.log("updated quiz", String(existing._id), "published:", existing.published);
    } else {
      await quiz.save();
      console.log("created quiz", String(quiz._id), "published:", quiz.published);
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
