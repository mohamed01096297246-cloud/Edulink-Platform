const Schedule = require("../models/Schedule");
const User = require("../models/User");
const Classroom = require("../models/Classroom");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createSchedule = async (req, res) => {
  try {
    const { teacher, classroom, day, startTime, endTime } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a schedule for.",
      });
    }

    const teacherData = await User.findOne({ _id: teacher, role: "teacher" });
    if (!teacherData || teacherData.school?.toString() !== school.toString())
      return res.status(404).json({ message: "Teacher not found" });
    const classroomData = await Classroom.findById(classroom);
    if (
      !classroomData ||
      classroomData.school.toString() !== school.toString()
    )
      return res.status(404).json({ message: "Classroom not found" });

    const isAuthorized = teacherData.teachingGrades.some(
      (gId) => gId.toString() === classroomData.grade.toString(),
    );

    if (!isAuthorized) {
      return res.status(400).json({
        message:
          "teacher is not authorized to teach this grade, please check the teacher's teaching grades and the classroom's grade.",
      });
    }
    const [newStartH, newStartM] = startTime.split(":").map(Number);
    const [newEndH, newEndM] = endTime.split(":").map(Number);
    const newStartMinutes = newStartH * 60 + newStartM;
    const newEndMinutes = newEndH * 60 + newEndM;

    if (newEndMinutes <= newStartMinutes) {
      return res
        .status(400)
        .json({ message: "EndTime must be after StartTime" });
    }

    const existingSchedules = await Schedule.find({
      day,
      $or: [{ teacher }, { classroom }],
    });

    const hasConflict = existingSchedules.some((sch) => {
      const [exStartH, exStartM] = sch.startTime.split(":").map(Number);
      const [exEndH, exEndM] = sch.endTime.split(":").map(Number);
      const exStartMinutes = exStartH * 60 + exStartM;
      const exEndMinutes = exEndH * 60 + exEndM;

      return newStartMinutes < exEndMinutes && newEndMinutes > exStartMinutes;
    });

    if (hasConflict) {
      return res.status(400).json({
        message:
          "there is a scheduling conflict with the teacher or classroom for the specified day and time.",
      });
    }

    const schedule = await Schedule.create({
      teacher,
      subject: teacherData.subject,
      classroom,
      day,
      startTime,
      endTime,
      school,
    });

    res
      .status(201)
      .json({ message: "Schedule created successfully", schedule });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || !sameSchool(req, schedule))
      return res.status(404).json({ message: "this schedule does not exist" });

    await schedule.deleteOne();
    res.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const { day, startTime, endTime, teacher, classroom, subject } = req.body;
    const scheduleId = req.params.id;
    const existingSchedule = await Schedule.findById(scheduleId);
    if (!existingSchedule || !sameSchool(req, existingSchedule)) {
      return res.status(404).json({ message: "this schedule does not exist" });
    }
    if (day || startTime || endTime || teacher || classroom) {
      const checkDay = day || existingSchedule.day;
      const checkStart = startTime || existingSchedule.startTime;
      const checkEnd = endTime || existingSchedule.endTime;
      const checkTeacher = teacher || existingSchedule.teacher;
      const checkClassroom = classroom || existingSchedule.classroom;
      const conflict = await Schedule.findOne({
        _id: { $ne: scheduleId },
        day: checkDay,
        $or: [{ teacher: checkTeacher }, { classroom: checkClassroom }],
        $and: [
          { startTime: { $lt: checkEnd } },
          { endTime: { $gt: checkStart } },
        ],
      });
      if (conflict) {
        const conflictTarget =
          conflict.teacher.toString() === checkTeacher.toString()
            ? "teacher"
            : "classroom";
        return res.status(400).json({
          message: `There is a scheduling conflict with the ${conflictTarget}.`,
        });
      }
    }

    const updatedSchedule = await Schedule.findByIdAndUpdate(
      scheduleId,
      req.body,
      { new: true, runValidators: true },
    )
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      });
    res.json({
      success: true,
      message: "Schedule updated successfully",
      data: updatedSchedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCurrentClass = async (req, res) => {
  try {
    const now = new Date();
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const day = days[now.getDay()];
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const schedules = await Schedule.find({
      teacher: req.user.id,
      day,
    }).populate({
      path: "classroom",
      select: "name grade",
      populate: { path: "grade", select: "name academicYear" },
    });

    const currentClass = schedules.find((sch) => {
      const [sh, sm] = sch.startTime.split(":").map(Number);
      const [eh, em] = sch.endTime.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return currentTime >= start && currentTime <= end;
    });
    if (!currentClass) {
      return res
        .status(404)
        .json({ message: "لا يوجد حصة مجدولة لك في هذا الوقت" });
    }
    res.json(currentClass);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllSchedules = async (req, res) => {
  try {
    const filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { teacher: req.user.id } : {},
    );

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its schedules.",
      });
    }

    const data = await Schedule.find(filter)
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      })
      .sort({ startTime: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTeacherSchedule = async (req, res) => {
  try {
    const data = await Schedule.find({
      teacher: req.params.id,
      school: req.user.school,
    })
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      })
      .populate("subject", "name")
      .sort({ startTime: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getClassSchedule = async (req, res) => {
  try {
    const data = await Schedule.find({
      classroom: req.params.classroom,
      school: req.user.school,
    })
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .sort({ startTime: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
