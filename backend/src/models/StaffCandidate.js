const mongoose = require("mongoose");

// One teacher on a school's staff list, waiting to be given an account.
// The teachers' counterpart of AdmissionCandidate: imported from the
// school's own file (scripts/import-staff-candidates.js) so the teacher
// registration form can look a name up and fill itself in.
//
// The file carries what the school had to hand — name, subject, phone.
// It does not carry a national ID or an email, so those two are still
// typed at registration; everything the file does have is filled for them.
//
// Leaves the suggestions once `registeredUser` is set, and comes back if
// that teacher account is deleted.
const staffCandidateSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    serial: { type: Number },

    fullName: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },

    // The subject exactly as the school wrote it ("Science", "E", "لغة
    // عربية"). Free text on purpose: it is matched against the school's
    // own subjects at search time, since those may not exist yet when the
    // list is imported, and a school's labels don't always equal them.
    subjectLabel: { type: String, trim: true, default: "" },

    nationalId: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    rawPhone: { type: String, trim: true, default: "" },
    phones: { type: [String], default: [] },
    invalidPhones: { type: [String], default: [] },

    registeredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    registeredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

staffCandidateSchema.index({ school: 1, normalizedName: 1 }, { unique: true });
staffCandidateSchema.index({ school: 1, registeredUser: 1 });

module.exports = mongoose.model("StaffCandidate", staffCandidateSchema);
