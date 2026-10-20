const mongoose = require("mongoose");

// A school's survey about the app subscription, answered from a public link
// with no login. The link carries `slug`, a random handle, so it can't be
// guessed from the school's name. `price` is the year's subscription for a
// student, in Egyptian pounds, the same for every phone (Mohamed,
// 2026-10-20 — it used to be 250 for Android and 300 for iPhone). The page
// doesn't show it; it prices the owner's total.
const surveySchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      default: "استبيان الاشتراك في التطبيق",
    },
    price: {
      type: Number,
      default: 300,
    },
    // Closed, the page says so and takes no more answers.
    open: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Survey", surveySchema);
