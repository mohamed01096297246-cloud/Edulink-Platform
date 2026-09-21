const mongoose = require("mongoose");

// One child on a school's list of new admissions (the official "اخطار عن
// قيد تلاميذ مستجدين" sheet), waiting to be registered. Imported by
// scripts/import-admission-candidates.js so the registration form can look
// the child up by name and fill itself in, instead of the admin retyping
// the sheet.
//
// Kept apart from ContactDirectory on purpose: that is another school's
// phone book, with its own shape and its own importer. Nothing here is
// read or written by that flow, and nothing there by this one.
//
// A candidate leaves the suggestions the moment `registeredStudent` is set
// — inside the same transaction that creates the Student — and comes back
// if that student is deleted.
const admissionCandidateSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    // The grade the sheet admits the child into. Carrying it (rather than
    // only the sheet's label) is what lets a stage principal's search stay
    // inside their own stages, like every other grade-bound record.
    grade: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      required: true,
    },
    sheetLabel: { type: String, trim: true, default: "" },
    serial: { type: Number },

    studentName: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    // The form's two name fields, split the way the school's existing
    // students are stored: the first two names, then the rest.
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    gender: { type: String, enum: ["male", "female"] },

    religion: { type: String, trim: true, default: "" },
    birthDate: { type: Date },
    nationalId: { type: String, trim: true, default: "" },
    nationality: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },

    parentName: { type: String, trim: true, default: "" },
    parentFirstName: { type: String, trim: true, default: "" },
    parentLastName: { type: String, trim: true, default: "" },
    parentJob: { type: String, trim: true, default: "" },

    // The phone cell exactly as the school wrote it, then every mobile
    // number read out of it (Latin digits, 11-digit form, in the order
    // written) and whatever couldn't be read as one.
    rawPhone: { type: String, trim: true, default: "" },
    phones: { type: [String], default: [] },
    invalidPhones: { type: [String], default: [] },

    // Children whose families share any phone number are one household.
    // `primaryPhone` is the single number that household is registered
    // under — the same for every sibling, so they all land on one parent
    // account instead of one account per number.
    household: { type: String, default: "" },
    primaryPhone: { type: String, default: "" },

    registeredStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    registeredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

admissionCandidateSchema.index({ school: 1, grade: 1, normalizedName: 1 }, { unique: true });
admissionCandidateSchema.index({ school: 1, registeredStudent: 1 });

module.exports = mongoose.model("AdmissionCandidate", admissionCandidateSchema);
