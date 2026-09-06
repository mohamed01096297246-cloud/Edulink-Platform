const mongoose = require("mongoose");

// The tenant boundary every other collection scopes itself to. `plan`
// exists purely as bookkeeping metadata (which commercial arrangement this
// school is under) — it has no effect on data isolation, which is enforced
// the same way regardless of plan.
const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "School name is required"],
      trim: true,
    },

    // Short unique handle for the school (used in admin tooling, exports,
    // support conversations — not shown to parents/teachers/students).
    code: {
      type: String,
      required: [true, "School code is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },

    // Commercial arrangement — a school that bought the system outright vs.
    // one paying a recurring subscription. Purely informational today; a
    // future billing feature can key off this field without a schema change.
    plan: {
      type: String,
      enum: ["owned", "subscription"],
      default: "subscription",
    },

    active: {
      type: Boolean,
      default: true,
    },

    // Lesson times on Schedule are wall-clock strings ("10:00") with no zone
    // of their own, and the server runs in UTC — so anything that compares a
    // lesson time against "now" (the attendance window, the end-of-lesson
    // reminder) needs to know which clock the school reads. An IANA name
    // rather than a fixed offset, so daylight saving is followed on its own.
    timezone: {
      type: String,
      default: "Africa/Cairo",
      trim: true,
    },

    // Per-school module toggles — lets the platform owner match what a
    // school can use to their subscription tier without a code change.
    // Enforced server-side (see requireFeature in tenant.js), not just
    // hidden in the UI, so a disabled module is actually unreachable, not
    // just invisible.
    features: {
      fees: { type: Boolean, default: true },
      examAnalytics: { type: Boolean, default: true },
      staffAttendance: { type: Boolean, default: true },
      behavior: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("School", schoolSchema);
