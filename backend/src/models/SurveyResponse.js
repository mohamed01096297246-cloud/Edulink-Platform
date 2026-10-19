const mongoose = require("mongoose");

// One answer to a school's subscription survey (models/Survey.js). It names
// no student: the class, the kind of phone, and whether they would pay the
// price shown for it, kept as it was when they answered.
const surveyResponseSchema = new mongoose.Schema(
  {
    survey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Survey",
      required: true,
      index: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required: true,
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    phone: {
      type: String,
      enum: ["android", "iphone"],
      required: true,
    },
    subscribe: {
      type: Boolean,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SurveyResponse", surveyResponseSchema);
