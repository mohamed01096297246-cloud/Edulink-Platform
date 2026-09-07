const Schedule = require("../models/Schedule");
const Subject = require("../models/Subject");
const Classroom = require("../models/Classroom");

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
    const timetabled = await Schedule.find({
      teacher: teacher._id,
      classroom: classroomId,
    }).distinct("subject");

    const scheduled = timetabled
      .filter(Boolean)
      .map(String)
      .filter((id) => qualified.includes(id));

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
    const timetabled = await Schedule.find({ teacher: teacher._id })
      .populate({ path: "classroom", select: "grade", match: { grade: gradeId } })
      .then((rows) =>
        rows
          .filter((row) => row.classroom && row.subject)
          .map((row) => String(row.subject))
          .filter((id) => qualified.includes(id)),
      );

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

// Wraps the whole thing for controllers: either you get a subjectId back, or
// the response has already been sent and you stop.
const requireTeacherSubject = async (res, args) => {
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
  resolveTeacherSubject,
  requireTeacherSubject,
  ambiguousResponse,
  AMBIGUOUS_STATUS,
};
