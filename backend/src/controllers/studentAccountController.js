const Student = require("../models/Student");
const User = require("../models/User");
const Grade = require("../models/Grade");
const {
  generateStudentCode,
  generateReadablePassword,
} = require("../utils/generateCredentials");
const { scopeFilter, sameSchool } = require("../utils/tenant");
const { STAGE_LABELS } = require("../utils/stages");

// Pupils old enough to hold an account of their own. The school's decision,
// not a technical one: younger children are followed by their parents, who
// keep their own account either way — a student account is added alongside
// the parent's, never instead of it.
const SELF_SERVICE_STAGES = ["preparatory", "secondary"];

const ineligible = (grade) =>
  `حسابات الطلاب متاحة للمرحلة الإعدادية والثانوية فقط — "${grade?.name || "هذه المرحلة"}" ${
    grade?.stage ? `مرحلة ${STAGE_LABELS[grade.stage]}` : "غير محددة المرحلة"
  }.`;

// The students an admin asked about: a whole classroom, a whole grade, or a
// hand-picked list. Always narrowed to their own school and stages first.
const resolveStudents = async (req, body = {}) => {
  const { classroom, grade, students } = { ...req.query, ...body };

  const extra = {};
  if (classroom) extra.classroom = classroom;
  if (grade) extra.grade = grade;
  if (Array.isArray(students) && students.length) extra._id = { $in: students };

  const filter = scopeFilter(req, extra, "grade");
  if (!filter) return null;

  return Student.find(filter)
    .populate("grade", "name stage")
    .populate("classroom", "name")
    .sort({ firstName: 1, lastName: 1 });
};

// Who already has an account, and who doesn't — what the issuing screen
// lists before anything is created. Never returns a password: they are
// stored hashed, so a password exists in readable form only in the one
// response that creates it.
exports.listStudentAccounts = async (req, res) => {
  try {
    const students = await resolveStudents(req);
    if (!students) {
      return res.status(400).json({
        success: false,
        message: "Please specify a school (?school=id) to list its student accounts.",
      });
    }

    const accounts = await User.find({
      role: "student",
      studentProfile: { $in: students.map((s) => s._id) },
    })
      .select("username studentProfile active")
      .lean();
    const byStudent = new Map(accounts.map((a) => [String(a.studentProfile), a]));

    res.status(200).json({
      success: true,
      data: students.map((student) => {
        const account = byStudent.get(String(student._id));
        return {
          _id: student._id,
          fullName: `${student.firstName} ${student.lastName}`,
          grade: student.grade?.name || "",
          stage: student.grade?.stage || null,
          classroom: student.classroom?.name || "",
          eligible: SELF_SERVICE_STAGES.includes(student.grade?.stage),
          username: account?.username || null,
          hasAccount: !!account,
          active: account?.active ?? null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Issues accounts for every student in the selection who doesn't have one,
// and returns the credentials ONCE — this response is the only time the
// passwords exist in readable form, so the screen that calls it must put
// them in front of the admin to print before it navigates away.
exports.issueStudentAccounts = async (req, res) => {
  try {
    const students = await resolveStudents(req, req.body);
    if (!students) {
      return res.status(400).json({
        success: false,
        message: "Please specify a school (?school=id) to issue accounts for.",
      });
    }

    const eligible = students.filter((s) =>
      SELF_SERVICE_STAGES.includes(s.grade?.stage),
    );
    if (!eligible.length) {
      return res.status(400).json({
        success: false,
        message: students.length
          ? ineligible(students[0].grade)
          : "لا يوجد طلاب في هذا الاختيار.",
      });
    }

    const existing = await User.find({
      role: "student",
      studentProfile: { $in: eligible.map((s) => s._id) },
    }).select("studentProfile");
    const hasAccount = new Set(existing.map((a) => String(a.studentProfile)));

    const issued = [];
    for (const student of eligible) {
      if (hasAccount.has(String(student._id))) continue;

      // eslint-disable-next-line no-await-in-loop -- a classroom at a time,
      // and each account needs its own unique code checked against the rest.
      const username = await generateStudentCode(User);
      const password = generateReadablePassword();

      // eslint-disable-next-line no-await-in-loop -- as above.
      await User.create({
        firstName: student.firstName,
        lastName: student.lastName,
        role: "student",
        school: student.school,
        studentProfile: student._id,
        username,
        password,
        active: true,
      });

      issued.push({
        student: student._id,
        fullName: `${student.firstName} ${student.lastName}`,
        classroom: student.classroom?.name || "",
        grade: student.grade?.name || "",
        username,
        password,
      });
    }

    res.status(201).json({
      success: true,
      message: issued.length
        ? `تم إصدار بيانات دخول لعدد ${issued.length} طالب. اطبع الكشف الآن — كلمات المرور لا يمكن عرضها مرة أخرى.`
        : "كل الطلاب في هذا الاختيار لديهم حسابات بالفعل.",
      skipped: eligible.length - issued.length,
      data: issued,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// A lost password can't be looked up — it is hashed — so the only way back
// is a new one. The code (username) stays as it is, so whatever the school
// has already written in its records still works.
exports.reissueStudentPassword = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).populate(
      "grade",
      "name stage",
    );
    if (!student || !sameSchool(req, student)) {
      return res.status(404).json({ success: false, message: "الطالب غير موجود." });
    }

    if (!SELF_SERVICE_STAGES.includes(student.grade?.stage)) {
      return res.status(400).json({ success: false, message: ineligible(student.grade) });
    }

    const account = await User.findOne({ role: "student", studentProfile: student._id });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "هذا الطالب ليس له حساب بعد — أصدر له بيانات دخول أولًا.",
      });
    }

    const password = generateReadablePassword();
    account.password = password;
    account.active = true;
    await account.save();

    res.status(200).json({
      success: true,
      message: "تم إصدار كلمة مرور جديدة. اطبعها الآن — لن تظهر مرة أخرى.",
      data: {
        student: student._id,
        fullName: `${student.firstName} ${student.lastName}`,
        username: account.username,
        password,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Grades are needed by the screen to offer a choice; kept here so the
// eligibility rule lives in one file only.
exports.listEligibleGrades = async (req, res) => {
  try {
    // A principal over part of the school sees only their own stages of
    // these — the grade list is not narrowed by scopeFilter, which has no
    // grade to reach through here, so the intersection is taken directly.
    const stages = req.stageScope
      ? SELF_SERVICE_STAGES.filter((s) => req.stageScope.stages.includes(s))
      : SELF_SERVICE_STAGES;
    const filter = scopeFilter(req, { stage: { $in: stages } });
    if (!filter) {
      return res.status(400).json({ success: false, message: "Please specify a school." });
    }
    const grades = await Grade.find(filter).select("name stage academicYear").sort({ name: 1 });
    res.status(200).json({ success: true, data: grades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
