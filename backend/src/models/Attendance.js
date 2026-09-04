const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
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
    // A qualifier on an absence, deliberately not a fourth `status` value:
    // an excused absence is still an absence, so every existing query that
    // filters on status: "absent" (reports, dashboards, the parent app)
    // keeps counting it without needing to know this field exists.
    excused: {
      type: Boolean,
      default: false,
    },
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
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
    }
  },
  { timestamps: true }
);

attendanceSchema.index({ student: 1, schedule: 1, date: 1 }, { unique: true });
module.exports = mongoose.model("Attendance", attendanceSchema);