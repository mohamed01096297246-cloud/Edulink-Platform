const mongoose=require("mongoose");
const { STAGES } = require("../utils/stages");

const gradeSchema=new mongoose.Schema({
      name: {
    type: String,
    required: [true, "اسم المستوي مطلوب"],
    trim: true
  },

  // Which of the school's stages this grade sits in. Optional: a school
  // that runs as one undivided unit never needs it, and every school that
  // existed before stages were added has it unset. It only starts to
  // matter once the school appoints a principal over part of itself — a
  // stage-scoped admin reaches exactly the grades carrying their stage, so
  // a grade left unset is reachable only by an admin who oversees the
  // whole school.
  stage: {
    type: String,
    enum: [...STAGES, null],
    default: null,
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
  },}
)

gradeSchema.index({ name: 1, academicYear: 1, school: 1 }, { unique: true });

module.exports = mongoose.model("Grade", gradeSchema);