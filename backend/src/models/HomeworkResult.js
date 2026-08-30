const mongoose = require("mongoose");

const homeworkResultSchema = new mongoose.Schema(
  {
    homework: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Homework",
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },
    status: {
      type: String,
      enum: ["submitted", "missing"], 
      required: true
    },
    score: {
      type: Number,
      default: null
    },
    teacherFeedback: {
      type: String,
      trim: true,
      default: ""
    },
    gradedBy: {
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

homeworkResultSchema.index({ homework: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("HomeworkResult", homeworkResultSchema);