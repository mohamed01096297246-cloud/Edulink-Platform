const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema(
  {
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
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    day: {
      type: String,
      enum: ["sat", "sun", "mon", "tue", "wed", "thu"],
      required: true,
    },
    // Which of the day's fixed periods (1–7) this slot is. startTime/endTime
    // are derived from it and the classroom's grade (utils/periods.js) and
    // kept alongside it, since everything downstream reads the times.
    period: {
      type: Number,
      min: 1,
      max: 7,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
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

module.exports = mongoose.model("Schedule", scheduleSchema, "schedules");
