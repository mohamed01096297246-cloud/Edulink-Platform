const mongoose = require("mongoose");

// One photo of a board note. A separate document per photo, rather than an
// array inside BoardNote, for one hard reason: a MongoDB document cannot
// exceed 16MB, and a note with four phone photos would sail past that.
// Kept in the database rather than on disk for the same reason the single
// photo was (see BoardNote) — App Platform containers are ephemeral and run
// more than one instance, so a file written to disk is lost on the next
// deploy and invisible to the sibling instance.
//
// `order` is the position the teacher picked them in, and is what the
// image URL addresses — /api/board-notes/<note>/image/<order> — so the
// client needs no ids of its own and the URLs stay stable.
const boardNoteImageSchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BoardNote",
      required: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    order: {
      type: Number,
      required: true,
      default: 0,
    },
    // `select: false` keeps the bytes out of any query that isn't the
    // image endpoint itself.
    data: { type: Buffer, select: false },
    contentType: { type: String, default: "image/jpeg" },
  },
  { timestamps: true },
);

boardNoteImageSchema.index({ note: 1, order: 1 }, { unique: true });

module.exports = mongoose.model("BoardNoteImage", boardNoteImageSchema);
