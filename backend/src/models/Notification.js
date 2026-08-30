const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  message: {
    type: String,
    required: true,
    trim: true
  },

  target: {
    type: String,
    enum: ["all", "parent"],
    default: "all"
  },

  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
  },

}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);