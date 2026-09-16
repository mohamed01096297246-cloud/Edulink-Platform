const mongoose=require("mongoose");

const gradeSchema=new mongoose.Schema({
      name: {
    type: String,
    required: [true, "اسم المستوي مطلوب"],
    trim: true
  },

  academicYear: {
      type: String,
      required: [true, "السنة الدراسية مطلوبة"],
      trim: true,
      match: [/^\d{4}\/\d{4}$/, "يجب أن تكون السنة الدراسية بالشكل 2025/2026"],
    },

  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
  },

  // Where this grade's break falls in the fixed 7-period day, and how long
  // it lasts — see utils/periods.js. Null/0 means no break. Kept per grade
  // because different stages of the same school don't break at the same
  // time, and changing it re-times every period this grade already has.
  breakAfterPeriod: {
    type: Number,
    min: [1, "الفسحة لازم تكون بعد الحصة الأولى على الأقل"],
    max: [6, "الفسحة لازم تكون قبل الحصة السابعة"],
    default: null,
  },

  breakMinutes: {
    type: Number,
    min: [0, "مدة الفسحة لا يمكن أن تكون بالسالب"],
    max: [120, "مدة الفسحة كبيرة جدًا"],
    default: 0,
  },
}
)

gradeSchema.index({ name: 1, academicYear: 1, school: 1 }, { unique: true });

module.exports = mongoose.model("Grade", gradeSchema);