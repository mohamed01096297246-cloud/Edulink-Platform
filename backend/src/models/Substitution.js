const mongoose = require("mongoose");

// Covers one recurring Schedule slot on one specific date — a teacher's
// weekly Monday-10am class doesn't need a permanent substitute, just
// coverage for the day they're out.
const substitutionSchema = new mongoose.Schema(
  {
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    substituteTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

// One substitute per class slot per day — re-assigning just overwrites it.
substitutionSchema.index({ schedule: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Substitution", substitutionSchema);
