const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { toWeekStart } = require("../utils/weekScores");
const { schemeForClassroom, SCHEMES } = require("../utils/gradebook");
const { rosterWhere } = require("../utils/secondLanguage");
const { isAbsent, isWithdrawn, readMark, markUpdate } = require("../utils/absentMark");
const { weekName, marksBefore, tellMarks, noticeValue } = require("../utils/studentNotices");
const { skippedIn, closedMessage } = require("../utils/markingSkips");

exports.getClassroomWeeklyEvaluation = async (req, res) => {
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

    // A week whose تقييم أسبوعي is taken off — in every school, or for this
    // class and subject by the school's admin (utils/markingSkips.js) —
    // shows none, and says why, whatever was filed under it.
    const applies = !(await skippedIn(classroomId, subjectId, weekStart)).has("weeklyEvalScore");
    const evaluations = applies
      ? await WeeklyEvaluation.find({
          classroom: classroomId,
          subject: subjectId,
          weekStart,
        })
      : [];

    const scores = {};
    // The pupils whose 0 reads «غ», and those whose 0 reads «م»
    // (utils/absentMark.js).
    const absent = {};
    const withdrawn = {};
    evaluations.forEach((entry) => {
      scores[entry.student.toString()] = entry.score;
      if (isAbsent(entry.absent, entry.score)) absent[entry.student.toString()] = true;
      if (isWithdrawn(entry.withdrawn, entry.score)) withdrawn[entry.student.toString()] = true;
    });

    // What this classroom's weekly evaluation is out of — 10 or 20,
    // depending on its school's scheme for its stage.
    const scheme = await schemeForClassroom(classroomId);

    return res.status(200).json({
      success: true,
      data: {
        students,
        scores,
        absent,
        withdrawn,
        weekStart,
        scheme,
        maxScore: SCHEMES[scheme].max.weeklyEvalScore,
        noWeeklyEval: !applies,
        ...(applies ? {} : { message: closedMessage("weeklyEvalScore", weekStart) }),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBulkWeeklyEvaluation = async (req, res) => {
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

    if (!gradesList || gradesList.length === 0) {
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

    // Out of 10 or 20 depending on the classroom's scheme — checked here,
    // since the model has to allow the larger of the two.
    const max = SCHEMES[await schemeForClassroom(classroom)].max.weeklyEvalScore;
    // A number, or «غ» / «م» (utils/absentMark.js).
    const marks = gradesList.map((record) => readMark(record.score, max));

    if (marks.some((mark) => mark.error || mark.value === null)) {
      return res.status(400).json({
        success: false,
        message: `الدرجات لازم تكون رقم بين 0 و${max}، أو «غ» للغايب، أو «م» للمنقطع.`,
      });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.body.subjectId,
      marks: true,
    });
    if (!subjectId) return undefined;

    // Taken off this week (utils/markingSkips.js): nothing to record.
    if ((await skippedIn(classroomId, subjectId, weekStart)).has("weeklyEvalScore")) {
      return res.status(400).json({ success: false, message: closedMessage("weeklyEvalScore", weekStart) });
    }

    // «غ» and «م» set their flag; a number takes them off — but a 0 from an
    // app that can't send a letter (no `letters`) is a غ or م pupil's 0
    // saved back unchanged, and keeps it (utils/absentMark.js).
    const letters = Boolean(req.body.letters);
    const bulkOps = gradesList.map((record, i) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: subjectId,
          weekStart,
        },
        update: markUpdate(
          "score",
          marks[i],
          { classroom: classroomId, teacher: req.user.id, school: req.user.school },
          letters,
        ),
        upsert: true,
      },
    }));

    // What each student had, to tell only a mark that is new or different.
    const before = marksBefore(
      await WeeklyEvaluation.find({
        subject: subjectId,
        weekStart,
        student: { $in: gradesList.map((record) => record.studentId) },
      })
        .select("student score")
        .lean(),
      (d) => ({ score: d.score }),
    );

    await WeeklyEvaluation.bulkWrite(bulkOps);

    await tellMarks({
      subjectId,
      when: weekName(weekStart),
      columns: { score: { label: "التقييم الأسبوعي", max } },
      before,
      after: gradesList.map((record, i) => ({ studentId: record.studentId, marks: { score: noticeValue(marks[i]) } })),
      createdBy: req.user.id,
      school: req.user.school,
    });

    return res.status(200).json({
      success: true,
      message: "تم حفظ التقييم الأسبوعي بنجاح",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
