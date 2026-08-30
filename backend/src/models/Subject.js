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
  grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required:[true, "المستوي الدراسي مطلوب"],
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
subjectSchema.index({ name: 1, grade: 1, school: 1 }, { unique: true });

module.exports = mongoose.model("Subject", subjectSchema);