const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema(
  {
    // Optional: a slot can name only a subject, for a period the class still
    // has but no teacher runs in the app (طابور, نشاط, مكتبة). Such a lesson
    // shows on the class's timetable and nowhere else — no teacher's screen,
    // no attendance, no marks, and it is never the lesson the day's register
    // is taken in (utils/dailyAttendance.registerLesson skips it).
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
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
    // Which numbered period of the day this slot is. startTime/endTime are
    // copied from the bell schedule covering the classroom's grade on this
    // day (models/BellSchedule) and kept alongside it, since everything
    // downstream reads the times. How many periods a day has depends on the
    // grade and the day, so the bell schedule — not this schema — bounds it.
    period: {
      type: Number,
      min: 1,
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
    // Part of the class's «مادة ثانية» period: two (or more) languages taught
    // at the same time, each pupil sitting the one set on their record
    // (Student.secondLanguage). It is one row per language, so each teacher's
    // timetable, attendance and cover lessons work as for any lesson; only
    // these rows may share a class's time, and who is in the room is
    // narrowed by utils/secondLanguage.js.
    secondLanguage: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Schedule", scheduleSchema, "schedules");
