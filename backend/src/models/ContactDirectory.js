const mongoose = require("mongoose");

// A reference list only — not real accounts, not linked to any Student or
// User document. Imported once from the school's own household-contact
// spreadsheet (see scripts/import-contact-directory.js) so an admin
// registering a new student can look the child's name up and get the
// parent's phone instantly instead of calling to ask for it.
//
// `studentName` is deliberately the CHILD's name, matching the source
// sheet — this directory exists to answer "what's this kid's parent's
// number", which is what the admin actually knows at registration time.
const contactDirectorySchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    studentName: {
      type: String,
      required: true,
      trim: true,
    },

    // Same normalization the import script used to match this file against
    // the photographed class registers — diacritics/hamza/ta-marbuta
    // folded away, so a search for "احمد" also finds "أحمد". Indexed for
    // the lookup endpoint's regex search.
    normalizedName: {
      type: String,
      required: true,
      trim: true,
    },

    fatherPhone: { type: String, trim: true, default: "" },
    motherPhone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },

    // The source sheet's own label (e.g. "الصف الثالث") — informational
    // only, kept as free text rather than a Grade reference since this
    // entry isn't tied to any real registration.
    gradeLabel: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

contactDirectorySchema.index({ school: 1, normalizedName: 1 });

module.exports = mongoose.model("ContactDirectory", contactDirectorySchema);
