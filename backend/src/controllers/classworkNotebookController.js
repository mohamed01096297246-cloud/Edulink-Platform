const ClassworkNotebook = require("../models/ClassworkNotebook");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { toWeekStart } = require("../utils/weekScores");
const { rosterWhere } = require("../utils/secondLanguage");
const { isAbsent, isWithdrawn, readMark, markUpdate } = require("../utils/absentMark");
const { weekName, marksBefore, tellMarks, noticeValue } = require("../utils/studentNotices");
const { skippedIn, closedMessage } = require("../utils/markingSkips");

exports.getClassroomClassworkNotebook = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const weekStart = toWeekStart(req.query.weekStart);

    if (!weekStart) {
      return res.status(400).json({
        success: false,
        message: "اختر تاريخ بداية الأسبوع أولًا.",
      });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    const students = await Student.find({
      classroom: classroomId,
      active: true,
      ...(await rosterWhere(classroomId, subjectId)),
    })
      .select("firstName lastName gender")
      .sort({ firstName: 1 });

    // Taken off this week for this class and subject (utils/markingSkips.js):
    // shows none, and says why, whatever was filed under it.
    const closed = (await skippedIn(classroomId, subjectId, weekStart)).has("classworkScore");
    const entries = closed
      ? []
      : await ClassworkNotebook.find({
          classroom: classroomId,
          subject: subjectId,
          weekStart,
        });

    const scores = {};
    // The pupils whose 0 reads «غ», and those whose 0 reads «م»
    // (utils/absentMark.js).
    const absent = {};
    const withdrawn = {};
    entries.forEach((entry) => {
      scores[entry.student.toString()] = entry.score;
      if (isAbsent(entry.absent, entry.score)) absent[entry.student.toString()] = true;
      if (isWithdrawn(entry.withdrawn, entry.score)) withdrawn[entry.student.toString()] = true;
    });

    return res.status(200).json({
      success: true,
      data: {
        students,
        scores,
        absent,
        withdrawn,
        weekStart,
        ...(closed ? { closed: true, message: closedMessage("classworkScore", weekStart) } : {}),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBulkClassworkNotebook = async (req, res) => {
  try {
    const { classroomId, weekStart: rawWeekStart, gradesList } = req.body;
    const weekStart = toWeekStart(rawWeekStart);

    if (!classroomId) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الفصل الأول." });
    }

    if (!weekStart) {
      return res.status(400).json({
        success: false,
        message: "اختر تاريخ بداية الأسبوع أولًا.",
      });
    }

    if (!Array.isArray(gradesList) || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    // Any number from 0 to 5, or «غ» / «م» (utils/absentMark.js). A pupil
    // sent with no mark is left as they are.
    const read = gradesList.map((record) => ({ record, mark: readMark(record.score, 5) }));

    if (read.some(({ mark }) => mark.error)) {
      return res.status(400).json({
        success: false,
        message: "الدرجات لازم تكون بين 0 و5، رقم صحيح أو بربع أو نص درجة (زي 4.5 أو 3.25)، أو «غ» للغايب، أو «م» للمنقطع.",
      });
    }
    const marked = read.filter(({ mark }) => mark.value !== null);
    if (marked.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
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
      marks: true,
    });
    if (!subjectId) return undefined;

    if ((await skippedIn(classroomId, subjectId, weekStart)).has("classworkScore")) {
      return res.status(400).json({ success: false, message: closedMessage("classworkScore", weekStart) });
    }

    // «غ» and «م» set their flag; a number takes them off, but a 0 from an
    // app that can't send a letter keeps it (utils/absentMark.js).
    const letters = Boolean(req.body.letters);
    const bulkOps = marked.map(({ record, mark }) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: subjectId,
          weekStart,
        },
        update: markUpdate(
          "score",
          mark,
          { classroom: classroomId, teacher: req.user.id, school: req.user.school },
          letters,
        ),
        upsert: true,
      },
    }));

    // What each student had, to tell only a mark that is new or different.
    const before = marksBefore(
      await ClassworkNotebook.find({
        subject: subjectId,
        weekStart,
        student: { $in: marked.map(({ record }) => record.studentId) },
      })
        .select("student score")
        .lean(),
      (d) => ({ score: d.score }),
    );

    await ClassworkNotebook.bulkWrite(bulkOps);

    await tellMarks({
      subjectId,
      when: weekName(weekStart),
      columns: { score: { label: "كراسة الحصة", max: 5 } },
      before,
      after: marked.map(({ record, mark }) => ({ studentId: record.studentId, marks: { score: noticeValue(mark) } })),
      createdBy: req.user.id,
      school: req.user.school,
    });

    return res.status(200).json({
      success: true,
      message: "تم حفظ درجات كراسة الحصة بنجاح",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
