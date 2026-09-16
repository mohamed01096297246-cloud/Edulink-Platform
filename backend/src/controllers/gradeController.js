const Grade = require("../models/Grade");
const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Exam = require("../models/Exam");
const User = require("../models/User");
const Schedule = require("../models/Schedule");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");
const { periodTimes } = require("../utils/periods");

// The form sends "" for "no break"; the schema wants null/0. Only touches
// the keys that were actually sent, so an unrelated edit leaves them alone.
const normalizeBreak = (body) => {
  const out = { ...body };
  if ("breakAfterPeriod" in out) {
    const n = Number(out.breakAfterPeriod);
    out.breakAfterPeriod = out.breakAfterPeriod === "" || out.breakAfterPeriod === null || !n ? null : n;
  }
  if ("breakMinutes" in out) {
    out.breakMinutes = Number(out.breakMinutes) || 0;
  }
  if (out.breakAfterPeriod === null) out.breakMinutes = 0;
  return out;
};

// A grade's period times are derived from its break, so moving the break
// has to move every period already booked for that grade — otherwise the
// stored times (which attendance and both apps read) would silently
// disagree with the grid. Legacy slots without a period number are left
// as they are; there's nothing to derive them from.
const retimeGradeSchedules = async (grade) => {
  const classroomIds = (await Classroom.find({ grade: grade._id }).select("_id")).map((c) => c._id);
  if (classroomIds.length === 0) return 0;

  const schedules = await Schedule.find({
    classroom: { $in: classroomIds },
    period: { $gte: 1 },
  }).select("period startTime endTime");

  const ops = [];
  for (const s of schedules) {
    const times = periodTimes(s.period, grade);
    if (times && (times.startTime !== s.startTime || times.endTime !== s.endTime)) {
      ops.push({ updateOne: { filter: { _id: s._id }, update: { $set: times } } });
    }
  }
  if (ops.length > 0) await Schedule.bulkWrite(ops);
  return ops.length;
};

exports.createGrade = async (req, res) => {
  try {
    const { name, academicYear, breakAfterPeriod, breakMinutes } = normalizeBreak(req.body);
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a grade for.",
      });
    }

    const grade = await Grade.create({ name, academicYear, school, breakAfterPeriod, breakMinutes });

    res.status(201).json({
      success: true,
      message: "Grade created successfully",
      data: grade,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        message: "This grade already exists for this academic year.",
      });
    }
    res.status(400).json({ message: err.message });
  }
};

exports.getAllGrades = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its grades.",
      });
    }

    const grades = await Grade.find(filter);
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateGrade = async (req, res) => {
  try {
    const existing = await Grade.findById(req.params.id);

    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Grade not found" });
    }

    const updates = normalizeBreak(req.body);
    delete updates.school;

    const grade = await Grade.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    const breakChanged =
      (existing.breakAfterPeriod || null) !== (grade.breakAfterPeriod || null) ||
      (existing.breakMinutes || 0) !== (grade.breakMinutes || 0);

    const retimed = breakChanged ? await retimeGradeSchedules(grade) : 0;

    res.status(200).json({
      success: true,
      message: retimed > 0
        ? `تم تحديث المرحلة، واتعدّلت مواعيد ${retimed} حصة حسب الفسحة الجديدة.`
        : "Grade updated successfully",
      retimed,
      data: grade,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const existing = await Grade.findById(req.params.id);

    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Grade not found" });
    }

    // Classroom/Student/Subject/Exam all point at a grade by id, and
    // teachers carry it in teachingGrades — deleting the grade out from
    // under any of them would leave a dangling reference (populate("grade")
    // would just silently come back null wherever it's used). Mirror the
    // same dependency checks classroomController/subjectController/
    // teacherController already enforce before their own deletes.
    const [classroomsCount, studentsCount, subjectsCount, examsCount, teachersCount] =
      await Promise.all([
        Classroom.countDocuments({ grade: existing._id }),
        Student.countDocuments({ grade: existing._id }),
        Subject.countDocuments({ grade: existing._id }),
        Exam.countDocuments({ grade: existing._id }),
        User.countDocuments({ role: "teacher", teachingGrades: existing._id }),
      ]);

    if (classroomsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has classrooms assigned to it. Please delete or reassign those classrooms first.",
      });
    }
    if (studentsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has students enrolled in it.",
      });
    }
    if (subjectsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has subjects assigned to it. Please delete or reassign those subjects first.",
      });
    }
    if (examsCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because it has exams scheduled for it.",
      });
    }
    if (teachersCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this grade because there are teachers assigned to teach it.",
      });
    }

    await existing.deleteOne();
    res
      .status(200)
      .json({ success: true, message: "Grade deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
