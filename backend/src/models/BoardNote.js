const mongoose = require("mongoose");

// A quick photo of something written on the board (or an external
// reference) that students/parents need to see or pay attention to —
// deliberately separate from Homework: no due date, no total marks, no
// grading. It lives in the same "الواجبات" section of the app but is its
// own independent thing.
const boardNoteSchema = new mongoose.Schema(
  {
    caption: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
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
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BoardNote", boardNoteSchema);
