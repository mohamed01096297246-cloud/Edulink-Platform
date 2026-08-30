const mongoose = require("mongoose");

// One fee record per student per charge (a term's tuition, a bus fee, a
// one-off charge, ...). Payments accumulate in `payments` rather than
// overwriting `paidAmount` directly, so the admin always has a real receipt
// trail to show a parent who disputes what they've paid.
const feeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    // Free-form label so the admin can tell charges apart on the student's
    // ledger — "مصروفات الترم الأول", "باص", "رسوم كتب", etc.
    title: {
      type: String,
      required: true,
      trim: true,
    },

    academicYear: {
      type: String,
      required: true,
      trim: true,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        date: { type: Date, default: Date.now },
        method: {
          type: String,
          enum: ["cash", "bank_transfer", "card", "other"],
          default: "cash",
        },
        note: { type: String, trim: true },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    // Derived on every save from totalAmount/discount/payments — kept as a
    // real field (not a virtual) so it's queryable/filterable/sortable
    // directly from Mongo without pulling every document into memory.
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

feeSchema.methods.recalculateStatus = function () {
  const paid = this.payments.reduce((sum, p) => sum + p.amount, 0);
  const owed = this.totalAmount - this.discount;

  if (paid <= 0) this.status = "unpaid";
  else if (paid >= owed) this.status = "paid";
  else this.status = "partial";
};

// Mongoose 9 dropped the callback-style `(next) => {...; next();}` pre-hook
// signature — hooks are now plain (optionally async) functions, so no
// callback is passed in and calling `next()` throws "next is not a
// function". A synchronous hook like this one just runs to completion.
feeSchema.pre("save", function () {
  this.recalculateStatus();
});

feeSchema.index({ school: 1, student: 1 });
feeSchema.index({ school: 1, status: 1 });

module.exports = mongoose.model("Fee", feeSchema);
