const mongoose = require("mongoose");

// A term's tests on the weekly40 scheme (utils/gradebook.js): two per term,
// each out of 15, together 30 of أعمال السنة's 70. The classic scheme's
// monthly test (MonthlyGrade) is keyed by month; these are keyed by term
// and test number, because that is how the paper register lists them —
// "الاختبار الأول / الثاني", not a month.
const termTestSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    // "2026/2027", as on the classroom.
    academicYear: { type: String, required: true, trim: true },
    term: { type: Number, required: true, enum: [1, 2] },
    testNo: { type: Number, required: true, enum: [1, 2] },

    grade: {
      type: Number,
      required: true,
      min: 0,
      max: 15,
    },
  },
  { timestamps: true },
);

termTestSchema.index(
  { student: 1, subject: 1, academicYear: 1, term: 1, testNo: 1 },
  { unique: true },
);
termTestSchema.index({ classroom: 1, subject: 1, academicYear: 1, term: 1 });

module.exports = mongoose.model("TermTest", termTestSchema);
