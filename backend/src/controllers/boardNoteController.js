const BoardNote = require("../models/BoardNote");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { sameSchool } = require("../utils/tenant");
const { notifyParentsOfStudents } = require("../utils/notify");

exports.createBoardNote = async (req, res) => {
  try {
    const { classroomId, caption } = req.body;

    if (!classroomId) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الفصل الأول." });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "لازم ترفق صورة." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);

    const note = await BoardNote.create({
      caption: (caption || "").trim(),
      imageUrl: `/uploads/board-notes/${req.file.filename}`,
      classroom: classroomId,
      teacher: req.user.id,
      subject: teacher.subject,
      school: req.user.school,
    });

    const subjectDoc = await Subject.findById(teacher.subject).select("name");
    const students = await Student.find({
      classroom: classroomId,
      active: true,
    }).populate("parent", "pushToken");

    // Best-effort — never blocks the note save if it fails partway through.
    notifyParentsOfStudents({
      students,
      type: "boardNote",
      title: "ملاحظة جديدة من المعلم",
      message: note.caption
        ? `مادة ${subjectDoc?.name || ""}: ${note.caption}`
        : `المعلم أضاف ملاحظة جديدة (صورة) في مادة ${subjectDoc?.name || ""}.`,
      school: req.user.school,
      createdBy: req.user.id,
    }).catch((err) =>
      console.log("Board note — parent notify error:", err.message),
    );

    res.status(201).json({
      success: true,
      message: "تم إضافة الملاحظة بنجاح",
      data: note,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Newest first — a teacher's own notes for one classroom (scoped to their
// own subject, same convention homework/weekly-evaluation/etc. use).
exports.getClassroomBoardNotes = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const teacher = await User.findById(req.user.id);

    const notes = await BoardNote.find({
      classroom: classroomId,
      subject: teacher.subject,
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// A parent/student sees every subject's notes for their classroom, not
// just one teacher's — unlike the teacher-facing list above.
exports.getStudentBoardNotes = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ success: false, message: "الطالب غير موجود" });
    }

    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بعرض ملاحظات هذا الطالب.",
      });
    }

    const notes = await BoardNote.find({ classroom: student.classroom })
      .populate("subject", "name")
      .populate("teacher", "firstName lastName")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteBoardNote = async (req, res) => {
  try {
    const note = await BoardNote.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ success: false, message: "الملاحظة غير موجودة" });
    }

    if (
      note.teacher.toString() !== req.user.id &&
      !(req.user.role === "admin" && sameSchool(req, note))
    ) {
      return res
        .status(403)
        .json({ success: false, message: "غير مصرح لك بحذف هذه الملاحظة" });
    }

    await note.deleteOne();

    res.status(200).json({ success: true, message: "تم حذف الملاحظة بنجاح" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
