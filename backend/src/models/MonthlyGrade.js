const mongoose = require("mongoose");

// Lightweight "monthly test" grade — deliberately not tied to the Exam
// model's admin-scheduled timetable: the teacher just picks a classroom and
// types a score per student, no exam creation step involved. One record per
// student/subject/month/year, so re-entering next month never clobbers the
// previous month's grade.
const monthlyGradeSchema = new mongoose.Schema(
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
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    // Out of 15, not 100 — this is a light monthly check, not a full exam.
    grade: {
      type: Number,
      required: true,
      min: 0,
      max: 15,
    },
  },
  { timestamps: true },
);

monthlyGradeSchema.index(
  { student: 1, subject: 1, month: 1, year: 1 },
  { unique: true },
);

module.exports = mongoose.model("MonthlyGrade", monthlyGradeSchema);
