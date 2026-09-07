const mongoose = require("mongoose");

// A "حصة احتياط" — a teacher standing in for an absent colleague.
//
// It is deliberately not a Schedule row. A Schedule entry is the weekly
// timetable: it repeats, it belongs to the teacher who owns the subject, and
// parents and admins read it as "who teaches what". A cover lesson is a
// one-off on a single date, given by a teacher who is neither the class's
// teacher nor teaching their own subject — writing it into the timetable
// would misreport all three.
//
// The separation is also what keeps cover attendance out of the marks. Every
// grade calculation filters attendance by `subject`, and a cover lesson has
// none: the teacher is supervising a class outside their own grade and
// subject, so an absence here says nothing about the student's work in any
// subject and must not move a single score.
const coverSessionSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },

    grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required: true,
    },

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    // UTC midnight of the lesson's calendar date, matching Attendance.
    date: {
      type: Date,
      required: true,
    },

    // Mirrors Schedule's shape so the same attendance-window helper can read
    // a cover session and a timetabled lesson without caring which it has.
    day: {
      type: String,
      enum: ["sat", "sun", "mon", "tue", "wed", "thu", "fri"],
      required: true,
    },

    // School-local wall clock, "HH:MM" — set from the moment the teacher
    // starts the session, running for COVER_MINUTES.
    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// Lets "does this teacher already have a cover session running?" be one
// indexed lookup rather than a scan of the day's sessions.
coverSessionSchema.index({ teacher: 1, date: 1 });
coverSessionSchema.index({ classroom: 1, date: 1 });

module.exports = mongoose.model("CoverSession", coverSessionSchema);
