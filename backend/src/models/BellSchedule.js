const mongoose = require("mongoose");

const HHMM = [/^([01]\d|2[0-3]):[0-5]\d$/, "الوقت لازم يكون بالشكل 08:00"];

const periodSlotSchema = new mongoose.Schema(
  {
    period: { type: Number, required: true, min: 1, max: 12 },
    startTime: { type: String, required: true, match: HHMM },
    endTime: { type: String, required: true, match: HHMM },
  },
  { _id: false },
);

const breakSlotSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true, match: HHMM },
    endTime: { type: String, required: true, match: HHMM },
  },
  { _id: false },
);

// The school's bell: when each numbered period starts and ends. It is not
// one grid for everyone — the lower and upper grades keep different hours,
// and the same grades keep different hours on different days (a shorter
// Wednesday/Thursday, 40-minute afternoon periods for the upper grades,
// five-minute changeovers after the break). So each document is one such
// set of times, applied to the grades and days it lists; together they must
// cover every (grade, day) at most once.
//
// Schedules store their times copied from here (attendance, the teacher's
// current class and both apps read startTime/endTime), and editing a bell
// schedule re-times every period that follows it.
const bellScheduleSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    name: {
      type: String,
      required: [true, "اسم مجموعة المواعيد مطلوب"],
      trim: true,
    },
    grades: [{ type: mongoose.Schema.Types.ObjectId, ref: "Grade" }],
    days: [
      {
        type: String,
        enum: ["sat", "sun", "mon", "tue", "wed", "thu"],
      },
    ],
    periods: [periodSlotSchema],
    breaks: [breakSlotSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("BellSchedule", bellScheduleSchema);
