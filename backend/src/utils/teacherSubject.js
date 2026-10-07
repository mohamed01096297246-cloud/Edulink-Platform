const Subject = require("../models/Subject");
const Classroom = require("../models/Classroom");
const { teacherClassPairs, teacherSubjectsIn } = require("./teacherClassrooms");

// Keeps only the teacher's subjects that are actually taught to this grade.
// Returns the current pool untouched when that would leave nothing, so a
// school with its coverage half-filled still gets a usable answer instead of
// an error it cannot act on.
const narrowByGrade = async (qualified, gradeId, fallback) => {
  const covering = await Subject.find({
    _id: { $in: qualified },
    ...Subject.coveringGrade(gradeId),
  }).distinct("_id");

  return covering.length > 0 ? covering.map(String) : fallback;
};

// Which subject does this teacher's work in this classroom belong to?
//
// A teacher used to carry exactly one subject, so every homework, mark and
// note could just be stamped with `teacher.subject`. Now that a teacher may
// take several subjects, that field is gone and the question has a real
// answer to work out — and, occasionally, no single answer at all.
//
// The order below is deliberate: the timetable is the school's own statement
// of who teaches what to whom, so it is consulted first and trusted over
// anything inferred. Only when the timetable is silent (a school that hasn't
// entered one yet) do we fall back to what the teacher is qualified for.
//
// Returns one of:
//   { subjectId }                          — settled
//   { ambiguous: true, options: [...] }     — caller should ask the teacher
//   { error: "..." }                        — nothing sensible to use
const resolveTeacherSubject = async ({
  teacher,
  classroomId,
  gradeId,
  requestedSubjectId,
}) => {
  const qualified = (teacher.subjects || []).map((s) => String(s._id || s));

  if (qualified.length === 0) {
    return { error: "لم يتم إسناد أي مادة لهذا المعلم. راجع إدارة المدرسة." };
  }

  // An explicit choice from the app wins, but only over the subjects the
  // teacher actually holds — otherwise the picker would become a way to
  // write marks into a colleague's subject.
  if (requestedSubjectId) {
    if (!qualified.includes(String(requestedSubjectId))) {
      return { error: "المادة المختارة ليست من مواد هذا المعلم." };
    }
    return { subjectId: String(requestedSubjectId) };
  }

  if (qualified.length === 1) {
    return { subjectId: qualified[0] };
  }

  let pool = qualified;

  if (classroomId) {
    // The class assignments made before the timetable say the same thing
    // the timetable does, so both count here.
    const scheduled = (await teacherSubjectsIn(teacher._id, classroomId)).filter(
      (id) => qualified.includes(id),
    );

    if (scheduled.length > 0) {
      pool = [...new Set(scheduled)];
    } else {
      // No timetable for this room. Narrow by what the subjects are taught
      // to — a teacher of both علوم (grades 4-6) and حاسب آلي (grade 1)
      // standing in a grade-5 room has only one possible answer.
      const classroom = await Classroom.findById(classroomId).select("grade");
      if (classroom?.grade) {
        pool = await narrowByGrade(qualified, classroom.grade, pool);
      }
    }
  } else if (gradeId) {
    // Homework is set for a whole grade at once, so there is no single
    // classroom to read a timetable from — the grade itself is the narrowing.
    const pairs = (await teacherClassPairs(teacher._id)).filter((p) => p.subject);
    const inGrade = new Set(
      (
        await Classroom.find({
          _id: { $in: pairs.map((p) => p.classroom) },
          grade: gradeId,
        }).distinct("_id")
      ).map(String),
    );
    const timetabled = pairs
      .filter((p) => inGrade.has(String(p.classroom)))
      .map((p) => String(p.subject))
      .filter((id) => qualified.includes(id));

    if (timetabled.length > 0) {
      pool = [...new Set(timetabled)];
    } else {
      pool = await narrowByGrade(qualified, gradeId, pool);
    }
  }

  if (pool.length === 1) {
    return { subjectId: pool[0] };
  }

  const options = await Subject.find({ _id: { $in: pool } })
    .select("name code")
    .sort({ name: 1 })
    .lean();

  return { ambiguous: true, options };
};

// The shape every endpoint returns when it cannot pick for itself. 409 rather
// than 400: the request is well-formed, it just needs one more decision that
// only the teacher can make. The app reads `needsSubject` to raise its picker.
const AMBIGUOUS_STATUS = 409;

const ambiguousResponse = (res, options) =>
  res.status(AMBIGUOUS_STATUS).json({
    success: false,
    needsSubject: true,
    message: "اختر المادة الأول — عندك أكتر من مادة في الفصل ده.",
    options,
  });

// Whether this teacher may read or write marks for this class (or, for
// homework set to a whole grade, this grade): it has to be in their own
// school, and be one they teach — on the timetable, assigned to them, or in
// a grade they are set to teach. Without this, a teacher could name any
// classroom id, even another school's, and read or overwrite its marks.
const teacherMayUse = async (teacher, { classroomId, gradeId }) => {
  const teachingGrades = new Set((teacher.teachingGrades || []).map((g) => String(g._id || g)));
  const school = String(teacher.school || "");

  if (classroomId) {
    const classroom = await Classroom.findById(classroomId).select("school grade").lean();
    if (!classroom || String(classroom.school) !== school) return false;
    if (teachingGrades.has(String(classroom.grade))) return true;
    const pairs = await teacherClassPairs(teacher._id);
    return pairs.some((p) => String(p.classroom) === String(classroomId));
  }

  if (gradeId) {
    const Grade = require("../models/Grade");
    const grade = await Grade.findById(gradeId).select("school").lean();
    if (!grade || String(grade.school) !== school) return false;
    if (teachingGrades.has(String(gradeId))) return true;
    const pairs = await teacherClassPairs(teacher._id);
    return Classroom.exists({ _id: { $in: pairs.map((p) => p.classroom) }, grade: gradeId }).then(Boolean);
  }

  return true;
};

// Wraps the whole thing for controllers: either you get a subjectId back, or
// the response has already been sent and you stop.
const requireTeacherSubject = async (res, args) => {
  if (args.teacher && !(await teacherMayUse(args.teacher, args))) {
    res.status(403).json({ success: false, message: "الفصل ده مش من فصولك." });
    return null;
  }

  const outcome = await resolveTeacherSubject(args);

  if (outcome.error) {
    res.status(400).json({ success: false, message: outcome.error });
    return null;
  }

  if (outcome.ambiguous) {
    ambiguousResponse(res, outcome.options);
    return null;
  }

  return outcome.subjectId;
};

module.exports = {
  teacherMayUse,
  resolveTeacherSubject,
  requireTeacherSubject,
  ambiguousResponse,
  AMBIGUOUS_STATUS,
};
