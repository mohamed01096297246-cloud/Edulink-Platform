const mongoose = require("mongoose");

// A teacher's manual correction to one of the *auto-computed* weekly
// coursework columns (مواظبة وسلوك / الواجب المنزلي). Those two are normally
// derived from attendance records and homework results, so there was no way
// to adjust them except by going back and editing the underlying records on
// their own screens. This lets the teacher fix the resulting number straight
// from the weekly-evaluation screen instead.
//
// Only the columns the teacher actually touched are stored — a field that
// isn't set here means "keep using the computed value", which is why both
// score fields are optional and are $unset (not zeroed) when the teacher
// resets a column back to automatic.
//
// The two manual columns (التقييم الأسبوعي، كراسة الحصة) are deliberately not
// here: they already have their own collections, and an override on top of a
// manual value would just be a second source of truth for the same number.
const courseworkOverrideSchema = new mongoose.Schema(
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

    // Same UTC-midnight Sunday convention as WeeklyEvaluation and
    // ClassworkNotebook, so all three line up on the same week bucket.
    weekStart: {
      type: Date,
      required: true,
    },

    attendanceScore: {
      type: Number,
      min: 0,
      max: 5,
    },

    homeworkScore: {
      type: Number,
      min: 0,
      max: 5,
    },
  },
  { timestamps: true },
);

courseworkOverrideSchema.index(
  { student: 1, subject: 1, weekStart: 1 },
  { unique: true },
);

module.exports = mongoose.model("CourseworkOverride", courseworkOverrideSchema);
