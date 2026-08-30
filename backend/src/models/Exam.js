const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Exam title is required (e.g., Midterm Exams)"],
      trim: true,
    },
    examType: {
      type: String,
      required: [true, "Exam type is required (e.g., midterm, final)"],
      enum: ["midterm", "final"],
      default: "final",
    },
    academicYear: {
      type: String,
      required: [true, "  academicYear required (e.g., 2025/2026)"],
      trim: true,
    },
    grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required: [true, "Grade is required"],
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    timetable: [
      {
        subject: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
          required: true,
        },
        date: {
          type: Date,
          required: true,
        },
        startTime: {
          type: String,
          required: true,
        },
        endTime: {
          type: String,
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Exam", examSchema);
