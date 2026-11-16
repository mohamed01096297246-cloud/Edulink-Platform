const mongoose = require("mongoose");

// An electronic test a student takes in the app: every question is answered
// by picking one choice — «اختر من متعدد», or «صح وغلط» as the two choices
// صح / غلط — so the server marks it the moment it is sent, and the student
// sees at once what they got right, what they got wrong, and why
// (controllers/studentQuizController.js).
//
// Who takes it is the classrooms listed; nothing else about the student
// matters. The answer and explanation of each question never leave the
// server until that student has sent their answers.
//
// As on the paper exam, a question may be about a text set in front of the
// student — «اقرأ النص التالي ثم أجب»: a reading passage, a poem, or the
// listening text. The text is a `passage` of the quiz, and every question
// on it names it; the app shows the text above each of its questions, so
// nothing is asked from memory. Grammar and spelling questions carry their
// own sentence and name none.
const passageSchema = new mongoose.Schema(
  {
    // How questions name it: "reading1", "poem"…
    key: { type: String, required: true, trim: true },
    // "reading" and "listening" are paragraphs; "poem" is one verse a line,
    // its two halves split by « ... ».
    kind: { type: String, enum: ["reading", "poem", "listening"], default: "reading" },
    title: { type: String, trim: true, default: "" },
    text: { type: String, required: true, trim: true },
    // A picture shown with the text (a map, a figure), by URL.
    image: { type: String, trim: true },
    // The listening text read aloud, by URL, for when the app plays sound.
    audio: { type: String, trim: true },
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    // "mcq" or "tf": how the app draws it. Both are marked the same way.
    type: { type: String, enum: ["mcq", "tf"], required: true },
    // The `key` of the passage it is about, if any.
    passage: { type: String, trim: true },
    // What it is worth; most are 1.
    points: { type: Number, default: 1, min: 0.5, max: 10 },
    // A picture the question is about, by URL.
    image: { type: String, trim: true },
    // The part of the unit it comes from («الاستماع»، «النحو»…), shown above
    // the question and used to sum the result up by part.
    section: { type: String, trim: true, default: "" },
    text: { type: String, required: true, trim: true },
    choices: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 6,
        message: "السؤال لازم يكون له من ٢ لـ ٦ اختيارات",
      },
    },
    // The index of the right choice.
    answer: { type: Number, required: true, min: 0 },
    // Said to the student who got it wrong: the right answer and why.
    explanation: { type: String, trim: true, default: "" },
  },
  { _id: true },
);

questionSchema.path("answer").validate(function validAnswer(v) {
  return Array.isArray(this.choices) && v < this.choices.length;
}, "الإجابة الصحيحة لازم تكون واحدة من الاختيارات");

const quizSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    title: { type: String, required: true, trim: true },
    // The subject as the student knows it; `subject` links it when there is
    // one to link.
    subjectName: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
    // «الوحدة الأولى: انتمائي قوتي», or whatever part of the course it covers.
    scope: { type: String, trim: true, default: "" },
    classrooms: [{ type: mongoose.Schema.Types.ObjectId, ref: "Classroom" }],
    passages: { type: [passageSchema], default: [] },
    questions: {
      type: [questionSchema],
      validate: [
        { validator: (v) => v.length > 0, message: "الامتحان من غير أسئلة" },
        {
          // Every passage a question names is one of the quiz's.
          validator(v) {
            const keys = new Set((this.passages || []).map((p) => p.key));
            return v.every((q) => !q.passage || keys.has(q.passage));
          },
          message: "فيه سؤال على نص مش موجود في الامتحان",
        },
      ],
    },
    // Only a published quiz is shown, and only between these dates when set.
    published: { type: Boolean, default: false },
    opensAt: { type: Date },
    closesAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

quizSchema.index({ school: 1, classrooms: 1, published: 1 });

module.exports = mongoose.model("Quiz", quizSchema);
