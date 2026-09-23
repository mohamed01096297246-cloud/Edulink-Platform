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
    // How many photos this note has. The photos themselves are their own
    // documents (see BoardNoteImage) because a note can carry several and
    // a MongoDB document stops at 16MB; this count is what lets a list
    // query build their URLs without fetching a single byte.
    imageCount: {
      type: Number,
      default: 0,
    },

    // Where the photo used to live, back when a note could only have one:
    // inside this document. Notes written then still carry theirs here, so
    // the image endpoint reads this when a note has no BoardNoteImage rows
    // — nothing already published is left without its picture.
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
//
// `imageUrl` stays, pointing at the first photo: app versions already on
// teachers' and parents' phones read that field, and they must keep
// showing the picture after this deploy.
boardNoteSchema.virtual("imageUrl").get(function getImageUrl() {
  return `/api/board-notes/${this._id}/image`;
});

boardNoteSchema.virtual("imageUrls").get(function getImageUrls() {
  const count = this.imageCount || 1;
  return Array.from(
    { length: count },
    (_, index) => `/api/board-notes/${this._id}/image/${index}`,
  );
});

module.exports = mongoose.model("BoardNote", boardNoteSchema);
