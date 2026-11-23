const mongoose = require("mongoose");

// «ملفات المراجعة» at the top of the student's واجباتي page: a file the
// school hands a whole grade before a test — the «بوصلة» revision booklets.
// A title, the subject, and a link to the PDF on the site
// (frontend/public/booklets), opened in the phone's browser. Every student
// whose class is in one of `grades` sees it; a file for a second language
// reaches only that language's pupils (utils/secondLanguage). Added with
// scripts/addReviewFile.js.
const reviewFileSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    grades: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Grade" }],
      validate: [(list) => list.length > 0, "حدد صفًا واحدًا على الأقل"],
    },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: null },
    title: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true },
    url: { type: String, required: true, trim: true, match: [/^https:\/\//, "رابط الملف لازم يبدأ بـ https://"] },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);

reviewFileSchema.index({ school: 1, grades: 1 });

module.exports = mongoose.model("ReviewFile", reviewFileSchema);
