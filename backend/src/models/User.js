const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    nationalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    role: {
      type: String,
      enum: ["admin", "teacher", "parent"],
      default: "parent",
    },

    // The school this user belongs to. Every user has one except the
    // platform super-admin (isSuperAdmin: true), who isn't scoped to any
    // single school since they manage the School accounts themselves.
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
    },

    // Platform-level operator (not a school's own admin) — replaces the
    // old scattered `username === "admin_master"` checks with one
    // authoritative flag.
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },

    // The one admin per school allowed to create/manage other admins for
    // that school (their "admin_master" equivalent) — distinct from
    // isSuperAdmin, which operates across schools rather than within one.
    isPrimaryAdmin: {
      type: Boolean,
      default: false,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null 
    },
teachingGrades: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Grade"
  }],
    username: {
      type: String,
      unique: true,
      trim: true,
      required: true, 
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, 
    },

    linkedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],

    active: {
      type: Boolean,
      default: true,
    },

    // Per-user mobile-app feature subset — finer-grained than School.features
    // (which is per-school). A school can be fully subscribed while one
    // specific parent or teacher still only has a limited set of tabs, e.g.
    // a trial account or a plan tier bought per-guardian rather than
    // per-school. Checked in addition to, not instead of, School.features
    // (see requireUserFeature in tenant.js) — both have to allow a module
    // for it to actually be reachable.
    appFeatures: {
      homework: { type: Boolean, default: true },
      exams: { type: Boolean, default: true },
      grades: { type: Boolean, default: true },
      behavior: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
      report: { type: Boolean, default: true },
      examGrades: { type: Boolean, default: true },
      homeworkGrades: { type: Boolean, default: true },
    },

    // Expo push token for this user's device — set when they log in from
    // the mobile app and grant notification permission. Null means we
    // can't push to them (web-only admin, or permission never granted).
    pushToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, 
  }
);


userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password.trim(), 10);

});


userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
