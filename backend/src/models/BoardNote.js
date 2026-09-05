const mongoose = require("mongoose");

// A quick photo of something written on the board (or an external
// reference) that students/parents need to see or pay attention to —
// deliberately separate from Homework: no due date, no total marks, no
// grading. It lives in the same "الواجبات" section of the app but is its
// own independent thing.
const boardNoteSchema = new mongoose.Schema(
  {
    caption: {
      type: String,
      trim: true,
      default: "",
    },
    // The photo lives in the document itself, not on disk. App Platform
    // containers are ephemeral and run more than one instance, so a file
    // written to local disk is wiped by the next deploy and invisible to
    // the sibling instance — an uploaded photo simply disappeared. Stored
    // here it survives deploys and is covered by the database's own daily
    // backups. `select: false` keeps the bytes out of every list query;
    // only the dedicated image endpoint asks for them.
    image: {
      data: { type: Buffer, select: false },
      contentType: { type: String },
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Clients only ever need the address of the image, never the bytes inline.
// Serving it from under /api matters: that's the only path the deployment
// routes to this backend at all.
boardNoteSchema.virtual("imageUrl").get(function getImageUrl() {
  return `/api/board-notes/${this._id}/image`;
});

module.exports = mongoose.model("BoardNote", boardNoteSchema);
