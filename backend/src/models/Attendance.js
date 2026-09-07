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
    // A record belongs to exactly one of these two: a timetabled lesson
    // (`schedule` + `subject`) or a cover lesson (`coverSession`). A cover
    // lesson has no subject on purpose — see the note on the index below.
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      required: function isTimetabled() {
        return !this.coverSession;
      },
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: function isTimetabled() {
        return !this.coverSession;
      },
    },
    coverSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoverSession",
      default: null,
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

// Both indexes are partial, because half the rows have no `schedule` and the
// other half no `coverSession`. A plain unique index on
// { student, schedule, date } would treat every cover record as
// { student, null, date } and so allow a student only one cover lesson per
// day — the same silent duplicate-key failure that a stale day-level index
// used to cause for a student's second lesson (see
// scripts/drop-stale-attendance-index.js).
attendanceSchema.index(
  { student: 1, schedule: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { schedule: { $type: "objectId" } },
    name: "student_schedule_date_unique",
  },
);

attendanceSchema.index(
  { student: 1, coverSession: 1 },
  {
    unique: true,
    partialFilterExpression: { coverSession: { $type: "objectId" } },
    name: "student_coverSession_unique",
  },
);

// Every grade calculation reads attendance through this filter. Cover
// lessons are supervision, not teaching: the teacher is in someone else's
// class and outside their own subject, so an absence there must not touch a
// mark, an attendance rate, or a report. Matches records where the field is
// null *or* absent, so rows written before cover lessons existed still count.
attendanceSchema.statics.GRADED_ONLY = { coverSession: null };

module.exports = mongoose.model("Attendance", attendanceSchema);