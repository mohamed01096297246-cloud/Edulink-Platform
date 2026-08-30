const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam", 
      required: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },
    grade: {
      type: Number,
      required: true,
      min: 0,
      max: 100 
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true
    }
  },
  { timestamps: true }
);

resultSchema.index({ student: 1, exam: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("Result", resultSchema);