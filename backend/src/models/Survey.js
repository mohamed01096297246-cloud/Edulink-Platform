const mongoose = require("mongoose");

// A school's survey about the app subscription, answered from a public link
// with no login. The link carries `slug`, a random handle, so it can't be
// guessed from the school's name. Prices are per year, in Egyptian pounds,
// by the kind of phone the student uses.
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
    prices: {
      android: { type: Number, default: 250 },
      iphone: { type: Number, default: 300 },
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
