const mongoose = require("mongoose");

// One row per end-of-lesson reminder that has been sent.
//
// This collection exists for its unique index, not for its contents. The
// backend runs as more than one instance, so the reminder sweep runs in every
// one of them at the same moment; without a shared claim, a teacher would get
// the same warning two or three times over. Each instance tries to insert the
// row first and only sends when the insert wins, which turns "send once" into
// something the database enforces rather than something the schedule hopes for.
const attendanceReminderSchema = new mongoose.Schema(
  {
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
    },

    // UTC midnight of the lesson's calendar date — the same normalisation
    // Attendance uses, so the two line up on the same day.
    date: {
      type: Date,
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
  },
  { timestamps: true },
);

attendanceReminderSchema.index({ schedule: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceReminder", attendanceReminderSchema);
