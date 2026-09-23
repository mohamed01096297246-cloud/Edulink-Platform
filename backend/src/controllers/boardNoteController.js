const BoardNote = require("../models/BoardNote");
const BoardNoteImage = require("../models/BoardNoteImage");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
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

    // "images" from the current app, "image" from versions already
    // installed, and multer's own `req.file` shape for good measure.
    const files = [
      ...(req.files?.images || []),
      ...(req.files?.image || []),
      ...(req.file ? [req.file] : []),
    ];

    if (!files.length) {
      return res
        .status(400)
        .json({ success: false, message: "لازم ترفق صورة واحدة على الأقل." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res
        .status(404)
        .json({ success: false, message: "الفصل غير موجود." });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.body.subjectId,
    });
    if (!subjectId) return undefined;

    const note = await BoardNote.create({
      caption: (caption || "").trim(),
      imageCount: files.length,
      classroom: classroomId,
      teacher: req.user.id,
      subject: subjectId,
      school: req.user.school,
    });

    // The photos are their own documents; if writing them fails, the note
    // must not survive as an empty frame with no picture in it.
    try {
      await BoardNoteImage.insertMany(
        files.map((file, index) => ({
          note: note._id,
          school: req.user.school,
          order: index,
          data: file.buffer,
          contentType: file.mimetype,
        })),
      );
    } catch (imageErr) {
      await BoardNoteImage.deleteMany({ note: note._id });
      await note.deleteOne();
      throw imageErr;
    }

    const subjectDoc = await Subject.findById(subjectId).select("name");
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
        : `المعلم أضاف ملاحظة جديدة (${files.length > 1 ? `${files.length} صور` : "صورة"}) في مادة ${subjectDoc?.name || ""}.`,
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
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
    });
    if (!subjectId) return undefined;

    const notes = await BoardNote.find({
      classroom: classroomId,
      subject: subjectId,
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

    // A student not yet placed in a classroom has no notes to show — and
    // must never reach BoardNote.find with an undefined `classroom`, which
    // Mongoose would silently drop from the filter and return every
    // classroom's notes instead of none.
    const notes = student.classroom
      ? await BoardNote.find({ classroom: student.classroom })
          .populate("subject", "name")
          .populate("teacher", "firstName lastName")
          .sort({ createdAt: -1 })
      : [];

    res.status(200).json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Serves the stored photo itself. Scoped to the school rather than to one
// classroom: a teacher legitimately views notes for classrooms they teach
// and a parent for their child's, but neither should be able to read
// another school's images by guessing an id.
// Serves one photo of a note, addressed by its position: /image is the
// first one (what older app versions ask for), /image/2 the third. Notes
// written before a note could hold several still have their photo inside
// the note document itself, and are read from there.
exports.getBoardNoteImage = async (req, res) => {
  try {
    const order = Number(req.params.index || 0);

    const note = await BoardNote.findById(req.params.id).select(
      "+image.data image.contentType school imageCount",
    );

    if (!note) {
      return res
        .status(404)
        .json({ success: false, message: "الصورة غير موجودة" });
    }

    // Checked before the bytes are fetched — an id alone proves nothing.
    if (!sameSchool(req, note)) {
      return res
        .status(403)
        .json({ success: false, message: "غير مصرح لك بعرض هذه الصورة" });
    }

    const stored = Number.isInteger(order)
      ? await BoardNoteImage.findOne({ note: note._id, order }).select("+data")
      : null;

    const data = stored?.data || (order === 0 ? note.image?.data : null);
    const contentType =
      stored?.contentType || note.image?.contentType || "image/jpeg";

    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "الصورة غير موجودة" });
    }

    res.set("Content-Type", contentType);
    // The bytes for a given note never change, so let the phone keep them
    // instead of re-downloading the photo on every screen visit.
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.send(data);
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

    // The photos are separate documents now — deleting the note alone
    // would leave them behind, taking up space nothing points at.
    await BoardNoteImage.deleteMany({ note: note._id });
    await note.deleteOne();

    res.status(200).json({ success: true, message: "تم حذف الملاحظة بنجاح" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
