const mongoose = require("mongoose");

// «رفع بند من الرصد»: a week in which a class's subject has no mark in one
// or more of the register's columns — the teacher told the school there was
// no تقييم أسبوعي (or كراسة الحصة, …) that week, and an admin took it off
// (controllers/markingSkipController.js). The week is then out of the
// columns left, never short by the one taken off (utils/markingSkips.js).
//
// One document per class, subject and week; the columns are the register's
// own keys (utils/gradebook.js). Marks filed under a column taken off stay
// where they are, left out of every figure, and count again if it is put
// back.
const COLUMNS = ["attendanceScore", "homeworkScore", "weeklyEvalScore", "classworkScore"];

const markingSkipSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    // The Sunday of the week, as every mark files it (utils/weekScores.toWeekStart).
    weekStart: { type: Date, required: true },
    columns: { type: [{ type: String, enum: COLUMNS }], default: [] },
    // The admin who last changed it.
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

markingSkipSchema.index({ classroom: 1, subject: 1, weekStart: 1 }, { unique: true });
markingSkipSchema.index({ school: 1, weekStart: -1 });

markingSkipSchema.statics.COLUMNS = COLUMNS;

module.exports = mongoose.model("MarkingSkip", markingSkipSchema);
