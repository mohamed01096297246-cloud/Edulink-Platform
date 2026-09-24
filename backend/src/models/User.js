const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { STAGES } = require("../utils/stages");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    // Required for staff (admin/teacher) — their identity has to be
    // verifiable. Optional for a parent: some schools register a family
    // without one on hand, and a parent account still needs to exist so the
    // student can be created. When it's missing, phoneNumber is what links
    // that parent's other children together instead (see studentController).
    //
    // Never set on a student: they are children, and their account is
    // deliberately built to carry no identifier beyond the code we issue.
    //
    // Optional for a teacher too: a school can issue its teachers coded
    // logins straight off its staff list (see staffAccountController),
    // which carries names, subjects and phones but no national IDs. An
    // admin's account still needs one.
    nationalId: {
      type: String,
      required: function () {
        return this.role === "admin";
      },
      trim: true,
    },

    // Unique per role, not globally — see the compound index below. A
    // phone number identifies a real person, and a real person can
    // legitimately need two accounts here: a teacher whose own child
    // attends the same school also needs a parent account, both tied to
    // the same phone. What must stay unique is "this phone as a teacher"
    // and separately "this phone as a parent", not the phone on its own.
    // Not required of a student: a child of 12 has no phone of their own,
    // and the family's number already belongs to the parent account. It is
    // also why the uniqueness index below only covers accounts that have
    // one — two siblings would otherwise collide on their father's number.
    //
    // Not required of a teacher either: one issued a coded login signs in
    // with that code, and a school's list sometimes has a number nobody
    // can read — that shouldn't keep the teacher out of the system.
    phoneNumber: {
      type: String,
      required: function () {
        return this.role === "admin" || this.role === "parent";
      },
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    role: {
      type: String,
      enum: ["admin", "teacher", "parent", "student"],
      default: "parent",
    },

    // For a student account: the Student record it belongs to. The parent's
    // equivalent is `linkedStudents` — a family holds several children,
    // a student holds only himself, so the two are kept apart rather than
    // one pretending to be the other.
    studentProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
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

    // The stages this admin presides over, for a school split into stages
    // with a principal over each. Empty (the default, and what every admin
    // created before this existed has) means the whole school — the
    // general manager, and any school that isn't split at all. Non-empty
    // narrows every query this admin makes to the grades carrying these
    // stages; enforced server-side in tenant.js, so it is a real boundary
    // and not a hidden menu. Meaningless on teachers and parents, who are
    // already narrowed by their own assignments and children.
    managedStages: {
      type: [{ type: String, enum: STAGES }],
      default: [],
    },

    // Every subject this teacher is qualified to teach. Which one a given
    // action belongs to is decided per lesson (see resolveTeacherSubject),
    // never by reading a single field off the teacher — a teacher who takes
    // both علوم and رياضيات for the same class has two answers here, and the
    // timetable is what tells them apart.
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      },
    ],

    teachingGrades: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Grade",
      },
    ],
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
      home: { type: Boolean, default: true },
      homework: { type: Boolean, default: true },
      exams: { type: Boolean, default: true },
      grades: { type: Boolean, default: true },
      behavior: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
      report: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      schedule: { type: Boolean, default: true },
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


// A plain `unique: true` would only ever let ONE user in the whole system
// have no national ID — MongoDB's default unique index treats every missing
// field as the same null value, so the second parent registered without one
// would fail with a duplicate-key error. Partial index instead: uniqueness
// is enforced only among documents where the field actually exists, so any
// number of parents can go without one and staff (which always sets it)
// stays exactly as unique as before.
userSchema.index(
  { nationalId: 1 },
  { unique: true, partialFilterExpression: { nationalId: { $type: "string" } } },
);

// One account per phone number per role — see the comment on `phoneNumber`
// above for why this isn't a bare unique index. Partial, because student
// accounts carry no phone at all and any number of them would otherwise
// count as duplicates of each other (see scripts/migrate-student-index.js
// for the rebuild of the older, non-partial version of this index).
userSchema.index(
  { phoneNumber: 1, role: 1 },
  { unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } } },
);

// A student account is the one account tied to a single Student record —
// re-issuing credentials must update that account, never add a second one.
userSchema.index(
  { studentProfile: 1 },
  { unique: true, partialFilterExpression: { studentProfile: { $type: "objectId" } } },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password.trim(), 10);

});


userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
