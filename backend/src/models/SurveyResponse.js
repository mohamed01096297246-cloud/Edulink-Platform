const mongoose = require("mongoose");

// One answer to a school's subscription survey (models/Survey.js). It names
// no student, only the class. Since 2026-10-20 an answer is a subscription
// and asks nothing else; the answers from before also hold the kind of phone
// and whether they would subscribe — a «لا» there is not a subscription.
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
    },
    subscribe: {
      type: Boolean,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SurveyResponse", surveyResponseSchema);
