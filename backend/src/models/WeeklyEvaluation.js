const mongoose = require("mongoose");

// The manual, teacher-judged half of the coursework score — "التقييم
// الأسبوعي", out of 10, one entry per student/subject/week. `weekStart` is
// whatever calendar date the teacher picks for that week (no fixed
// Sunday/Monday rule), normalized to UTC midnight so the same week always
// matches the same stored date regardless of the time of day it was saved.
const weeklyEvaluationSchema = new mongoose.Schema(
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
    // Whole numbers only — this is a teacher's on-the-spot weekly judgment
    // call, not a percentage-derived calculation, so it never carries
    // fractions (unlike the auto-computed coursework columns).
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
      validate: {
        validator: Number.isInteger,
        message: "درجة التقييم الأسبوعي لازم تكون رقم صحيح من غير كسور.",
      },
    },
  },
  { timestamps: true },
);

weeklyEvaluationSchema.index(
  { student: 1, subject: 1, weekStart: 1 },
  { unique: true },
);

module.exports = mongoose.model("WeeklyEvaluation", weeklyEvaluationSchema);
