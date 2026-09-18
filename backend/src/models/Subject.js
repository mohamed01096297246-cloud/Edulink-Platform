const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "اسم المادة مطلوب"],
    trim: true 
  },
  code: {
    type: String,
    required: [true, "كود المادة مطلوب"],
    trim: true,
    uppercase: true
  },
  // A subject is taught to a set of grades, not to one. "علوم" for grades 4
  // through 6 is a single subject, so a teacher, a mark and a timetable slot
  // all point at the same row no matter which grade the class is in — before
  // this, the same subject had to be duplicated per grade and its records
  // could never be read together.
  grades: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
    },
  ],

  // "عربي للكل". Stored as an intent rather than as a snapshot of every
  // grade that exists today, so a grade added next year is covered without
  // anyone remembering to come back and tick it.
  allGrades: {
    type: Boolean,
    default: false,
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
  },
}, { timestamps: true });

// `code` used to be globally unique, which meant two different schools
// could never both use, say, "MATH101" — now scoped per school like every
// other uniqueness rule here.
subjectSchema.index({ code: 1, school: 1 }, { unique: true });

// One row per subject name per school. This replaces the old
// { name, grade, school } index, which was what forced a school to invent
// "علوم 1", "علوم 2", "علوم 3" — one subject per grade, each with its own
// code, none of them able to see the others' records.
subjectSchema.index({ name: 1, school: 1 }, { unique: true });

// True when this subject is taught to the given grade. `allGrades` wins on
// its own, so a school-wide subject needs no grade list to maintain.
subjectSchema.methods.coversGrade = function (gradeId) {
  if (this.allGrades) return true;
  if (!gradeId) return false;
  return this.grades.some((g) => String(g._id || g) === String(gradeId));
};

// The Mongo filter for "subjects taught to this grade", used wherever a list
// is narrowed to one grade.
subjectSchema.statics.coveringGrade = (gradeId) => ({
  $or: [{ allGrades: true }, { grades: gradeId }],
});

// The same question asked of several grades at once — "which subjects does
// this stage see?". A school-wide subject counts for every stage, exactly
// as it counts for every grade.
subjectSchema.statics.coveringGrades = (gradeIds) => ({
  $or: [{ allGrades: true }, { grades: { $in: gradeIds } }],
});

module.exports = mongoose.model("Subject", subjectSchema);