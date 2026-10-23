const mongoose = require("mongoose");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Schedule = require("../models/Schedule");
const { sameSchool } = require("../utils/tenant");

// «مادة ثانية»: which language each pupil of a class takes in the period
// the class's timetable splits between languages (models/Schedule.js
// `secondLanguage`, utils/secondLanguage.js). The languages on offer are the
// class's own — the subjects of those timetable rows — so a pupil can only
// be given one their class actually has.

const loadClassroom = async (req, res, classroomId) => {
  if (!mongoose.Types.ObjectId.isValid(String(classroomId || ""))) {
    res.status(400).json({ success: false, message: "اختار الفصل." });
    return null;
  }
  const classroom = await Classroom.findById(classroomId).select("name grade school");
  if (!classroom || !sameSchool(req, classroom)) {
    res.status(404).json({ success: false, message: "الفصل غير موجود." });
    return null;
  }
  return classroom;
};

// The class's languages, each with the teacher who has it on the timetable.
const languagesOf = async (classroomId) => {
  const rows = await Schedule.find({ classroom: classroomId, secondLanguage: true })
    .populate("subject", "name")
    .populate("teacher", "firstName lastName")
    .lean();
  const bySubject = new Map();
  for (const row of rows) {
    if (!row.subject) continue;
    const key = String(row.subject._id);
    if (!bySubject.has(key)) {
      bySubject.set(key, {
        _id: row.subject._id,
        name: row.subject.name,
        teacher: row.teacher ? `${row.teacher.firstName} ${row.teacher.lastName}` : "",
      });
    }
  }
  return [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
};

// GET /students/second-language?classroom=ID — the class's languages and
// its pupils with the one each takes (null: not set yet).
exports.getClassSecondLanguages = async (req, res) => {
  try {
    const classroom = await loadClassroom(req, res, req.query.classroom);
    if (!classroom) return undefined;

    const [languages, students] = await Promise.all([
      languagesOf(classroom._id),
      Student.find({ classroom: classroom._id, active: true })
        .select("firstName lastName secondLanguage")
        .sort({ firstName: 1, lastName: 1 })
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        classroom: { _id: classroom._id, name: classroom.name },
        languages,
        students: students.map((s) => ({
          _id: s._id,
          name: `${s.firstName} ${s.lastName}`,
          secondLanguage: s.secondLanguage || null,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /students/second-language — { classroom, assignments: [{ student,
// language }] }, language null to clear. Only pupils of that class, and only
// a language the class has.
exports.setClassSecondLanguages = async (req, res) => {
  try {
    const classroom = await loadClassroom(req, res, req.body.classroom);
    if (!classroom) return undefined;

    const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    if (assignments.length === 0) {
      return res.status(400).json({ success: false, message: "مفيش طلاب اتغيّرت لغتهم." });
    }

    const offered = new Set((await languagesOf(classroom._id)).map((l) => String(l._id)));
    if (offered.size === 0) {
      return res.status(400).json({
        success: false,
        message: "الفصل ده مفيش في جدوله حصة «مادة ثانية» — ضيفها من الجدول الأول.",
      });
    }

    const inClass = new Set(
      (await Student.find({ classroom: classroom._id }).distinct("_id")).map(String),
    );

    const ops = [];
    for (const item of assignments) {
      const studentId = String(item?.student || "");
      const language = item?.language ? String(item.language) : null;
      if (!inClass.has(studentId)) continue;
      if (language && !offered.has(language)) {
        return res.status(400).json({ success: false, message: "اللغة دي مش من لغات الفصل." });
      }
      ops.push({
        updateOne: { filter: { _id: studentId }, update: { $set: { secondLanguage: language } } },
      });
    }

    if (ops.length === 0) {
      return res.status(400).json({ success: false, message: "الطلاب دول مش في الفصل ده." });
    }

    await Student.bulkWrite(ops);
    return res.status(200).json({
      success: true,
      message: ops.length === 1 ? "اتحفظت لغة الطالب." : `اتحفظت لغة ${ops.length} طالب.`,
      updated: ops.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
