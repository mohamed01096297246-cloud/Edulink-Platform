const mongoose = require("mongoose");

// The manual, teacher-judged "كراسة الحصة" half of coursework — out of 5,
// one entry per student/subject/week. Mirrors WeeklyEvaluation exactly
// (same weekStart convention, same upsert key) — it's graded on the same
// weekly cadence, just a separate number from "التقييم الأسبوعي".
const classworkNotebookSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    weekStart: {
      type: Date,
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "درجة كراسة الحصة لازم تكون رقم صحيح من غير كسور.",
      },
    },
  },
  { timestamps: true },
);

classworkNotebookSchema.index(
  { student: 1, subject: 1, weekStart: 1 },
  { unique: true },
);

module.exports = mongoose.model("ClassworkNotebook", classworkNotebookSchema);
