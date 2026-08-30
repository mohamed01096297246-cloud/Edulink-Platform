const mongoose = require("mongoose");

// Daily attendance for teachers (and other staff) — separate from the
// per-schedule student Attendance model, since staff attendance is marked
// once per day, not once per class period.
const staffAttendanceSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["present", "absent", "late"],
      required: true,
    },
    note: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
  },
  { timestamps: true },
);

staffAttendanceSchema.index({ teacher: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("StaffAttendance", staffAttendanceSchema);
