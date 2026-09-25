const TermTest = require("../models/TermTest");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const { requireTeacherSubject } = require("../utils/teacherSubject");
const { schemeForClassroom, SCHEMES } = require("../utils/gradebook");

// The two tests of a term on the weekly40 scheme — the screen that replaces
// "اختبار الشهر" for those classrooms. See models/TermTest.js.

const readTerm = (value) => (Number(value) === 2 ? 2 : Number(value) === 1 ? 1 : null);

// A classroom on the classic scheme records a monthly test instead; this
// screen is refused there rather than quietly writing marks nothing reads.
const requireWeekly40 = async (res, classroom) => {
  const scheme = await schemeForClassroom(classroom);
  if (scheme !== "weekly40") {
    res.status(400).json({
      success: false,
      message: "الفصل ده بيسجّل اختبار شهري، مش اختبارات الترم.",
    });
    return null;
  }
  return SCHEMES[scheme];
};

exports.getClassroomTermTests = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const term = readTerm(req.query.term);
    const testNo = readTerm(req.query.testNo);

    if (!term || !testNo) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الترم ورقم الاختبار." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }
    const rules = await requireWeekly40(res, classroom);
    if (!rules) return undefined;

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.query.subjectId,
    });
    if (!subjectId) return undefined;

    const students = await Student.find({ classroom: classroomId, active: true })
      .select("firstName lastName gender")
      .sort({ firstName: 1 });

    const tests = await TermTest.find({
      classroom: classroomId,
      subject: subjectId,
      academicYear: classroom.academicYear,
      term,
      testNo,
    }).select("student grade");

    const grades = {};
    tests.forEach((t) => {
      grades[t.student.toString()] = t.grade;
    });

    return res.status(200).json({
      success: true,
      data: { students, grades, term, testNo, maxScore: rules.termTestMax },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveBulkTermTests = async (req, res) => {
  try {
    const { classroomId, gradesList } = req.body;
    const term = readTerm(req.body.term);
    const testNo = readTerm(req.body.testNo);

    if (!classroomId || !term || !testNo) {
      return res
        .status(400)
        .json({ success: false, message: "اختر الفصل والترم ورقم الاختبار." });
    }
    if (!Array.isArray(gradesList) || gradesList.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "أدخل درجة طالب واحد على الأقل." });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ success: false, message: "الفصل غير موجود." });
    }
    const rules = await requireWeekly40(res, classroom);
    if (!rules) return undefined;

    const max = rules.termTestMax;
    const invalid = gradesList.some(
      (r) =>
        !r.studentId ||
        Number.isNaN(Number(r.grade)) ||
        Number(r.grade) < 0 ||
        Number(r.grade) > max,
    );
    if (invalid) {
      return res.status(400).json({
        success: false,
        message: `درجة الاختبار لازم تكون بين 0 و${max}.`,
      });
    }

    const teacher = await User.findById(req.user.id);
    const subjectId = await requireTeacherSubject(res, {
      teacher,
      classroomId,
      requestedSubjectId: req.body.subjectId,
    });
    if (!subjectId) return undefined;

    // Only students actually in this classroom — an id from anywhere else
    // is dropped rather than written against this class's marks.
    const enrolled = new Set(
      (await Student.find({ classroom: classroomId }).distinct("_id")).map(String),
    );

    const ops = gradesList
      .filter((r) => enrolled.has(String(r.studentId)))
      .map((r) => ({
        updateOne: {
          filter: {
            student: r.studentId,
            subject: subjectId,
            academicYear: classroom.academicYear,
            term,
            testNo,
          },
          update: {
            $set: {
              grade: Number(r.grade),
              classroom: classroomId,
              teacher: req.user.id,
              school: req.user.school,
            },
          },
          upsert: true,
        },
      }));

    if (ops.length) await TermTest.bulkWrite(ops);

    return res.status(200).json({
      success: true,
      message: `تم حفظ درجات الاختبار ${testNo === 1 ? "الأول" : "الثاني"} للترم ${term === 1 ? "الأول" : "الثاني"}.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
