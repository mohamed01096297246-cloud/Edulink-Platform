const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
gender: {
      type: String,
      enum: ["male", "female"],
      required: true,
    },

    grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required: true 
    },

    classroom: {  
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom"
    },

// Set at registration. Empty only for a student taken off a parent account
// that turned out not to be theirs, until the right parent is linked
// (familyAccessController) — so code reading it must allow for null.
parent: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null
},

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);