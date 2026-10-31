const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { toWeekStart } = require("../utils/weekScores");
const { schemeForClassroom, SCHEMES } = require("../utils/gradebook");
const { rosterWhere } = require("../utils/secondLanguage");
const { hasWeeklyEval } = require("../utils/schoolMonths");
const { isAbsent } = require("../utils/absentMark");
const { weekName, marksBefore, tellMarks } = require("../utils/studentNotices");

const NO_WEEKLY_EVAL = "الأسبوع ده مالوش تقييم أسبوعي في كل المدارس، فمش محتاج يترصد.";

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

    // A week with no تقييم أسبوعي (utils/schoolMonths.js) shows none, and
    // says so, whatever was filed under it.
    const applies = hasWeeklyEval(weekStart);
    const evaluations = applies
      ? await WeeklyEvaluation.find({
          classroom: classroomId,
          subject: subjectId,
          weekStart,
        })
      : [];

    const scores = {};
    // The pupils whose 0 reads «غ» (utils/absentMark.js).
    const absent = {};
    evaluations.forEach((entry) => {
      scores[entry.student.toString()] = entry.score;
      if (isAbsent(entry.absent, entry.score)) absent[entry.student.toString()] = true;
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
        weekStart,
        scheme,
        maxScore: SCHEMES[scheme].max.weeklyEvalScore,
        noWeeklyEval: !applies,
        ...(applies ? {} : { message: NO_WEEKLY_EVAL }),
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

    if (!hasWeeklyEval(weekStart)) {
      return res.status(400).json({ success: false, message: NO_WEEKLY_EVAL });
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
    const hasInvalidScore = gradesList.some(
      (record) =>
        record.score === null ||
        record.score === "" ||
        !Number.isFinite(Number(record.score)) ||
        record.score < 0 ||
        record.score > max,
    );

    if (hasInvalidScore) {
      return res.status(400).json({
        success: false,
        message: `الدرجات لازم تكون رقم بين 0 و${max}.`,
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

    // A pupil the admin marked «غ» (utils/absentMark.js) keeps it while the
    // teacher's screen saves their 0 back unchanged; any other mark is a real
    // one and takes it off.
    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: {
          student: record.studentId,
          subject: subjectId,
          weekStart,
        },
        update: {
          $set: {
            score: record.score,
            classroom: classroomId,
            teacher: req.user.id,
            school: req.user.school,
          },
          ...(Number(record.score) !== 0 ? { $unset: { absent: "" } } : {}),
        },
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
      after: gradesList.map((record) => ({ studentId: record.studentId, marks: { score: record.score } })),
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
