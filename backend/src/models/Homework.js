const mongoose = require("mongoose");

const homeworkSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "عنوان الواجب مطلوب (مثال: تدريبات النحو)"],
      trim: true
    },
    pageNumber: {
      type: String,
      required: [true, "رقم الصفحة مطلوب (مثال: ص 45)"],
      trim: true
    },
    // Optional: a homework set without a mark is only checked as handed in
    // or not (see utils/homeworkMarks.js for how each kind is scored).
    totalMarks: {
      type: Number,
      default: null,
      min: [0, "درجة الواجب لازم تكون رقم موجب"]
    },
    dueDate: {
      type: Date,
      required: [true, "تاريخ آخر موعد للتسليم مطلوب"]
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Homework", homeworkSchema);