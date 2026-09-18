// Every collection except User (for the platform super-admin) and School
// itself carries a required `school` field. These helpers are the only
// place scoping logic lives, so every controller enforces it the same way
// instead of hand-rolling the check.
//
// There are two boundaries, not one. The school is the hard tenant
// boundary — nothing ever crosses it. Inside a school, an admin may also
// be a principal over some of its stages only (User.managedStages), which
// narrows them to the grades carrying those stages. That second boundary
// applies to admins alone: teachers and parents are already narrowed by
// their own timetable and their own children, and the platform
// super-admin, who operates on a school from outside, is never one of its
// principals.

const Grade = require("../models/Grade");
const Classroom = require("../models/Classroom");
const Student = require("../models/Student");

// Resolves a caller's stage restriction into the concrete grade and
// classroom ids it covers, once per request. Returns null for anyone who
// sees their whole school, which is the common case and costs no queries.
exports.resolveStageScope = async (user) => {
  const stages = user?.role === "admin" ? user.managedStages || [] : [];
  if (!stages.length || user.isSuperAdmin) return null;

  const grades = await Grade.find({ school: user.school, stage: { $in: stages } }).select("_id");
  const gradeIds = grades.map((grade) => grade._id);

  const classrooms = await Classroom.find({
    school: user.school,
    grade: { $in: gradeIds },
  }).select("_id");

  return {
    stages,
    gradeIds,
    classroomIds: classrooms.map((classroom) => classroom._id),
    gradeSet: new Set(gradeIds.map(String)),
    classroomSet: new Set(classrooms.map((classroom) => String(classroom._id))),
  };
};

// The filter fragment that narrows a collection to the caller's stages,
// given which field that collection reaches a grade through. `{}` when the
// caller sees the whole school, so it is always safe to spread.
//
// A stage-scoped admin whose stages hold no grades yet gets `$in: []`,
// which matches nothing — an empty section reads as empty, rather than
// silently falling back to the whole school.
exports.stageWhere = (req, key = "grade") => {
  const scope = req.stageScope;
  if (!scope) return {};

  // "self" is the Grade collection itself, "grades" a collection that
  // spans several (a subject taught across a range, a bell schedule shared
  // by a set of grades) — those overlap the caller's stages if they touch
  // any one of their grades.
  if (key === "grade") return { grade: { $in: scope.gradeIds } };
  if (key === "grades") return { grades: { $in: scope.gradeIds } };
  if (key === "teachingGrades") return { teachingGrades: { $in: scope.gradeIds } };
  if (key === "classroom") return { classroom: { $in: scope.classroomIds } };
  if (key === "self") return { _id: { $in: scope.gradeIds } };

  throw new Error(`stageWhere: unsupported key "${key}"`);
};

// Adds a fragment to a filter without either one losing a condition. The
// caller may already be filtering on the very field the stage restriction
// uses — "students of grade X", say — and spreading one over the other
// would drop whichever lost, widening the result either past what was
// asked for or, worse, past the caller's stages. $and keeps both.
const mergeWhere = (base, fragment) => {
  const collides = Object.keys(fragment).some((key) => key in base);
  if (!collides) return { ...base, ...fragment };

  const { school, ...rest } = base;
  return { $and: [rest, fragment], ...(school ? { school } : {}) };
};

exports.mergeWhere = mergeWhere;

// Some collections reach a grade only through the student the record is
// about — attendance, marks, fees. Narrowing those means naming the
// students of the caller's stages, so the list is resolved on first use
// rather than for every request, and kept for the rest of this one.
exports.stageStudentWhere = async (req) => {
  const scope = req.stageScope;
  if (!scope) return {};

  if (!scope.studentIds) {
    const students = await Student.find({
      school: req.user.school,
      grade: { $in: scope.gradeIds },
    }).select("_id");
    scope.studentIds = students.map((student) => student._id);
  }

  return { student: { $in: scope.studentIds } };
};

// The parents a stage principal may reach: those with a child in one of
// their stages. A parent with children in two stages answers to both
// principals, which is the intended reading — the account is the family,
// not the child.
exports.stageParentWhere = async (req) => {
  if (!req.stageScope) return {};

  const { student } = await exports.stageStudentWhere(req);
  return { linkedStudents: student };
};

// The stages a family sits in, read from where their children actually
// are. Used to decide which part-of-school announcements reach them, so a
// family with a child in two stages hears from both.
exports.stagesOfParent = async (user) => {
  const students = await Student.find({
    _id: { $in: user.linkedStudents || [] },
  }).select("grade");

  const gradeIds = students.map((student) => student.grade).filter(Boolean);
  if (!gradeIds.length) return [];

  const stages = await Grade.find({ _id: { $in: gradeIds } }).distinct("stage");
  return stages.filter(Boolean);
};

// Whether a principal may act on someone's account. A teacher belongs to
// the stages they teach, a family to the stages their children are in.
// Admins are nobody's to manage but the school's own primary admin, who
// oversees the whole school and so never gets here with a stage scope.
exports.userInStage = async (req, user) => {
  if (!req.stageScope) return true;
  if (!user) return false;

  if (user.role === "teacher") {
    return (user.teachingGrades || []).some((grade) => exports.inStage(req, grade));
  }

  if (user.role === "parent") {
    const { student } = await exports.stageStudentWhere(req);
    const mine = new Set(student.$in.map(String));
    return (user.linkedStudents || []).some((id) => mine.has(String(id)));
  }

  return false;
};

// The filter that narrows a list of accounts to a principal's own people.
// Parents and teachers reach a stage by different routes, so listing both
// at once means either route qualifying.
exports.stageUserWhere = async (req) => {
  const scope = req.stageScope;
  if (!scope) return {};

  const { student } = await exports.stageStudentWhere(req);

  return {
    $or: [
      { role: "teacher", teachingGrades: { $in: scope.gradeIds } },
      { role: "parent", linkedStudents: student },
    ],
  };
};

// What a principal is told when they reach past their own stages. One
// wording everywhere, so the boundary reads as a rule of the system rather
// than as a different error each time it is hit.
exports.STAGE_DENIED =
  "هذه البيانات تخص مرحلة خارج نطاق إدارتك. تواصل مع إدارة المدرسة العامة.";

// True when a document the caller reached by id sits inside their stages.
// Takes the grade or classroom id off the document itself, so it works
// whether that field is populated or still a raw id. A document that
// carries neither (one reached through a student, say) can't be judged
// here — resolve its student's grade at the call site and pass that.
exports.inStage = (req, value) => {
  const scope = req.stageScope;
  if (!scope) return true;
  if (!value) return false;

  const id = String(value?._id || value);
  return scope.gradeSet.has(id) || scope.classroomSet.has(id);
};

// Builds a Mongo filter scoped to the caller's school, merged with any
// extra conditions. A platform super-admin has no school of their own, so
// they must explicitly say which school they're operating on via
// `?school=<id>` — returns null when that's missing, which callers should
// treat as "ask the caller to pick a school" rather than silently listing
// everything.
//
// `by` names the field this collection reaches a grade through ("grade" or
// "classroom") and adds the caller's stage restriction on top. Leave it
// out for collections that aren't tied to a grade at all (staff, contacts,
// the school's own settings), which every admin of the school shares.
exports.scopeFilter = (req, extra = {}, by = null) => {
  if (req.user.isSuperAdmin) {
    if (!req.query.school) return null;
    return { ...extra, school: req.query.school };
  }

  const scoped = mergeWhere(extra, by ? exports.stageWhere(req, by) : {});
  return { ...scoped, school: req.user.school };
};

// True when the caller may act on `doc`: it belongs to their school (or
// they're the platform super-admin, who acts across all schools) and, for
// a principal over part of the school, it sits in one of their stages.
// Use it before returning or mutating any document fetched by id — the id
// alone proves neither.
//
// The stage half reads whichever link the document carries to a grade.
// A document that carries none — a staff attendance row, a contact, an
// announcement — belongs to the school as a whole and every one of its
// admins may act on it; that is the intended reading, not an oversight.
// Users are the exception this can't judge: a teacher's stage is the
// grades they teach and a parent's is where their children are, so those
// two are checked in their own controllers.
exports.sameSchool = (req, doc) => {
  if (!doc) return false;
  if (req.user.isSuperAdmin) return true;
  if (!doc.school || !req.user.school) return false;
  if (doc.school.toString() !== req.user.school.toString()) return false;

  if (!req.stageScope) return true;

  // A grade names its stage directly; a grade left unclassified belongs to
  // no principal, only to whoever oversees the whole school.
  if (doc.stage !== undefined) return req.stageScope.stages.includes(doc.stage);

  // A subject taught to every grade spans the whole school, so changing it
  // reaches past any one stage.
  if (doc.allGrades === true) return false;

  if (doc.grade) return exports.inStage(req, doc.grade);
  if (doc.classroom) return exports.inStage(req, doc.classroom);
  if (Array.isArray(doc.grades) && doc.grades.length) {
    return doc.grades.some((grade) => exports.inStage(req, grade));
  }

  return true;
};

// The school id to stamp on a newly created document. Never trust a
// `school` field from the request body — it always comes from the
// authenticated user (or, for the super-admin creating on a school's
// behalf, from `?school=`).
exports.creationSchool = (req) => {
  if (req.user.isSuperAdmin) return req.query.school || req.body.school;
  return req.user.school;
};
