const mongoose = require("mongoose");

const classroomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "اسم الفصل مطلوب"],
      trim: true,
    },

grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required:[true, "المستوي الدراسي مطلوب"]
    },
    
    capacity: {
      type: Number,
      default: 30,
      max: [50, "لا يمكن أن تتجاوز سعة الفصل 50 طالبًا"],
    },

    currentStudents: { type: Number, default: 0 },

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
  },
  { timestamps: true }
);

classroomSchema.index(
  { name: 1, grade: 1, academicYear: 1, school: 1 },
  { unique: true }
);

module.exports = mongoose.model("Classroom", classroomSchema);