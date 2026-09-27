const ClassAssignment = require("../models/ClassAssignment");
const Classroom = require("../models/Classroom");
const Subject = require("../models/Subject");
const User = require("../models/User");
const {
  scopeFilter,
  creationSchool,
  inStage,
  userInStage,
  stageWhere,
  STAGE_DENIED,
} = require("../utils/tenant");

// Every assignment in the caller's school (or stages), for the admin page's
// "by teacher" and "by class" views.
exports.listAssignments = async (req, res) => {
  try {
    const filter = scopeFilter(req, {}, "classroom");
    if (!filter) {
      return res.status(400).json({ message: "Please specify a school (?school=id)." });
    }

    const data = await ClassAssignment.find(filter)
      .populate("teacher", "firstName lastName")
      .populate({ path: "classroom", select: "name grade", populate: { path: "grade", select: "name" } })
      .populate("subject", "name")
      .lean();

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Replaces one teacher's classes with the list sent: [{ classroom, subject }].
// A principal only replaces the part inside their own stages — whatever the
// teacher holds elsewhere in the school is left as it is.
exports.setTeacherAssignments = async (req, res) => {
  try {
    const school = creationSchool(req);
    if (!school) {
      return res.status(400).json({ message: "Please specify a school (?school=id)." });
    }

    const teacher = await User.findOne({ _id: req.params.teacherId, role: "teacher", school });
    if (!teacher) return res.status(404).json({ message: "المعلم غير موجود" });
    if (!(await userInStage(req, teacher))) {
      return res.status(403).json({ message: STAGE_DENIED });
    }

    const wanted = [];
    const seen = new Set();
    for (const item of Array.isArray(req.body.assignments) ? req.body.assignments : []) {
      const key = `${item.classroom}:${item.subject}`;
      if (!item.classroom || !item.subject || seen.has(key)) continue;
      seen.add(key);
      wanted.push({ classroom: String(item.classroom), subject: String(item.subject) });
    }

    const classrooms = await Classroom.find({
      _id: { $in: [...new Set(wanted.map((w) => w.classroom))] },
      school,
    })
      .select("name grade")
      .populate("grade", "name");
    const classroomById = new Map(classrooms.map((c) => [String(c._id), c]));

    const subjects = await Subject.find({
      _id: { $in: [...new Set(wanted.map((w) => w.subject))] },
      school,
    });
    const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
    const holds = new Set((teacher.subjects || []).map(String));

    for (const w of wanted) {
      const classroom = classroomById.get(w.classroom);
      const subject = subjectById.get(w.subject);
      if (!classroom || !subject) {
        return res.status(400).json({ message: "فصل أو مادة غير موجودة." });
      }
      if (!inStage(req, classroom.grade)) {
        return res.status(403).json({ message: STAGE_DENIED });
      }
      if (!holds.has(w.subject)) {
        return res.status(400).json({
          message: `مادة ${subject.name} مش من مواد المعلم ده — ضيفها له من صفحة المعلمين الأول.`,
        });
      }
      if (!subject.coversGrade(classroom.grade?._id)) {
        return res.status(400).json({
          message: `مادة ${subject.name} مش بتتدرّس لـ${classroom.grade?.name || "المرحلة دي"}.`,
        });
      }
    }

    // A subject in a class has one teacher. Name whoever already holds it,
    // so the admin knows whose class to take it off first.
    const taken = wanted.length
      ? await ClassAssignment.find({
          teacher: { $ne: teacher._id },
          $or: wanted.map((w) => ({ classroom: w.classroom, subject: w.subject })),
        }).populate("teacher", "firstName lastName")
      : [];
    if (taken.length > 0) {
      const where = taken.slice(0, 4).map((t) => {
        const classroom = classroomById.get(String(t.classroom));
        return `${subjectById.get(String(t.subject))?.name} في ${classroom?.grade?.name || ""} ${classroom?.name || ""} مع أ. ${t.teacher?.firstName} ${t.teacher?.lastName}`;
      });
      return res.status(400).json({
        message: `في فصول متسندة لمعلم تاني بالفعل: ${where.join("، ")}. شيلها من عنده الأول.`,
      });
    }

    await ClassAssignment.deleteMany({ teacher: teacher._id, ...stageWhere(req, "classroom") });
    if (wanted.length) {
      await ClassAssignment.insertMany(
        wanted.map((w) => ({ ...w, teacher: teacher._id, school })),
      );

      // Every per-grade permission (homework, the timetable, a principal's
      // view of their staff) reads teachingGrades, so a teacher given a
      // class is given its grade too.
      const gradeIds = [...new Set(classrooms.map((c) => String(c.grade?._id || c.grade)))];
      await User.updateOne({ _id: teacher._id }, { $addToSet: { teachingGrades: { $each: gradeIds } } });
    }

    res.json({
      success: true,
      message: wanted.length
        ? `تم حفظ ${wanted.length} فصل/مادة للمعلم ${teacher.firstName} ${teacher.lastName}.`
        : `تم إلغاء كل فصول المعلم ${teacher.firstName} ${teacher.lastName}.`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
