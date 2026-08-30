const StaffAttendance = require("../models/StaffAttendance");
const Substitution = require("../models/Substitution");
const Schedule = require("../models/Schedule");
const User = require("../models/User");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

// Same UTC-midnight convention as student Attendance/the admin dashboard —
// "today" always means the same instant no matter which of these three
// pieces of code computed it.
const parseDateParam = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

exports.recordBulkStaffAttendance = async (req, res) => {
  try {
    const { date, records } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to record attendance for.",
      });
    }
    if (!date || !records || records.length === 0) {
      return res.status(400).json({ message: "date and records are required" });
    }

    const pureDate = parseDateParam(date);

    const bulkOps = records.map((record) => ({
      updateOne: {
        filter: { teacher: record.teacherId, date: pureDate },
        update: {
          $set: {
            status: record.status,
            note: record.note || "",
            recordedBy: req.user._id,
            school,
          },
        },
        upsert: true,
      },
    }));

    await StaffAttendance.bulkWrite(bulkOps);

    res.status(200).json({ message: "Staff attendance saved successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getStaffAttendance = async (req, res) => {
  try {
    const extra = {};
    if (req.query.date) extra.date = parseDateParam(req.query.date);

    const filter = scopeFilter(req, extra);
    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list staff attendance.",
      });
    }

    const records = await StaffAttendance.find(filter)
      .populate("teacher", "firstName lastName")
      .sort({ date: -1 });

    res.status(200).json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// The actual point of tracking staff attendance: for every class period an
// absent teacher was supposed to teach today, who else is free to cover it.
exports.getCoverageNeeded = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: "date is required" });
    }

    const filter = scopeFilter(req);
    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) for this report.",
      });
    }

    const pureDate = parseDateParam(date);
    const dayName = DAY_NAMES[pureDate.getUTCDay()];

    const absentAttendance = await StaffAttendance.find({
      ...filter,
      date: pureDate,
      status: "absent",
    }).select("teacher");
    const absentTeacherIds = absentAttendance.map((a) => a.teacher.toString());

    if (absentTeacherIds.length === 0) {
      return res.status(200).json({ coverage: [] });
    }

    const todaysSchedules = await Schedule.find({
      ...filter,
      day: dayName,
      teacher: { $in: absentTeacherIds },
    })
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate("classroom", "name");

    const existingSubs = await Substitution.find({
      ...filter,
      date: pureDate,
      schedule: { $in: todaysSchedules.map((s) => s._id) },
    }).populate("substituteTeacher", "firstName lastName");
    const subBySchedule = new Map(
      existingSubs.map((s) => [s.schedule.toString(), s]),
    );

    // Every other teacher in the school, so we can tell the admin who's
    // actually free at that exact time slot instead of them guessing.
    const allTeachers = await User.find({
      ...filter,
      role: "teacher",
      _id: { $nin: absentTeacherIds },
    }).select("firstName lastName");

    const allTodaysSchedules = await Schedule.find({ ...filter, day: dayName });

    const toMinutes = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

    const coverage = todaysSchedules.map((slot) => {
      const slotStart = toMinutes(slot.startTime);
      const slotEnd = toMinutes(slot.endTime);

      const busyTeacherIds = new Set(
        allTodaysSchedules
          .filter(
            (s) =>
              s._id.toString() !== slot._id.toString() &&
              overlaps(slotStart, slotEnd, toMinutes(s.startTime), toMinutes(s.endTime)),
          )
          .map((s) => s.teacher.toString()),
      );

      const availableSubstitutes = allTeachers.filter(
        (t) => !busyTeacherIds.has(t._id.toString()),
      );

      return {
        schedule: slot,
        existingSubstitution: subBySchedule.get(slot._id.toString()) || null,
        availableSubstitutes,
      };
    });

    res.status(200).json({ coverage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSubstitution = async (req, res) => {
  try {
    const { scheduleId, date, substituteTeacherId, reason } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a substitution for.",
      });
    }

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule || schedule.school.toString() !== school.toString()) {
      return res.status(404).json({ message: "schedule not found" });
    }

    const pureDate = parseDateParam(date);

    const substitution = await Substitution.findOneAndUpdate(
      { schedule: scheduleId, date: pureDate },
      {
        schedule: scheduleId,
        date: pureDate,
        substituteTeacher: substituteTeacherId,
        reason,
        createdBy: req.user._id,
        school,
      },
      { upsert: true, new: true },
    );

    res.status(200).json({ message: "Substitute assigned successfully", substitution });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteSubstitution = async (req, res) => {
  try {
    const substitution = await Substitution.findById(req.params.id);
    if (!substitution || !sameSchool(req, substitution)) {
      return res.status(404).json({ message: "substitution not found" });
    }

    await substitution.deleteOne();

    res.status(200).json({ message: "Substitution removed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
