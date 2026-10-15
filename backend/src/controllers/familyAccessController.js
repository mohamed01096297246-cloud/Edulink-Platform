const mongoose = require("mongoose");
const School = require("../models/School");
const Student = require("../models/Student");
const User = require("../models/User");
const {
  resolveUsername,
  generateReadablePassword,
} = require("../utils/generateCredentials");
const { toLatinDigits, canonicalMobile } = require("../utils/phone");

// The platform owner's view of one school's families, from the schools page:
// which parent account each student hangs off, moving a student onto the
// right parent (or a new one), and handing a parent fresh login details.
//
// A parent account is found by its phone, the same way registration finds it
// (studentController.createStudent), so a family registered twice under one
// number is never split, and an account merged into another (User.mergedInto)
// always stands for the account it was merged into.
//
// Passwords are stored hashed: a parent's current one can't be shown, only
// replaced. Every response that creates or replaces one is the only time it
// can be read.

const fullName = (doc) => `${doc?.firstName || ""} ${doc?.lastName || ""}`.replace(/\s+/g, " ").trim();

// The phone as typed (Arabic digits, a dropped leading zero, +20…) to the
// stored 11-digit form, or null.
const readPhone = (value) => {
  const digits = toLatinDigits(value).replace(/\D/g, "");
  return canonicalMobile(digits);
};

const loadSchool = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.schoolId)) {
    res.status(404).json({ success: false, message: "المدرسة غير موجودة." });
    return null;
  }
  const school = await School.findById(req.params.schoolId).select("name");
  if (!school) res.status(404).json({ success: false, message: "المدرسة غير موجودة." });
  return school;
};

// The parent account a phone belongs to, following a merge to the account
// that now holds the family.
const parentByPhone = async (phone) => {
  let parent = await User.findOne({ phoneNumber: phone, role: "parent" });
  if (parent?.mergedInto) parent = await User.findById(parent.mergedInto);
  return parent;
};

const describeParent = async (parent) => {
  const children = await Student.find({ parent: parent._id }).select("firstName lastName").lean();
  return {
    _id: parent._id,
    name: fullName(parent),
    username: parent.username,
    phoneNumber: parent.phoneNumber,
    active: parent.active !== false,
    children: children.map(fullName),
  };
};

// Every student of the school with the parent account they belong to.
exports.listFamilies = async (req, res) => {
  try {
    const school = await loadSchool(req, res);
    if (!school) return undefined;

    const students = await Student.find({ school: school._id })
      .select("firstName lastName grade classroom parent active")
      .populate("grade", "name")
      .populate("classroom", "name")
      .lean();

    const parentIds = [...new Set(students.map((s) => String(s.parent)).filter(Boolean))];
    const parents = await User.find({ _id: { $in: parentIds } })
      .select("firstName lastName username phoneNumber active role")
      .lean();
    const parentById = new Map(parents.map((p) => [String(p._id), p]));

    const childrenOf = new Map();
    students.forEach((s) => {
      const key = String(s.parent);
      childrenOf.set(key, (childrenOf.get(key) || 0) + 1);
    });

    const rows = students
      .map((s) => {
        const parent = parentById.get(String(s.parent));
        return {
          _id: s._id,
          name: fullName(s),
          // Usually the father's name, which a new parent account starts from.
          lastName: s.lastName || "",
          active: s.active !== false,
          gradeId: s.grade?._id || null,
          grade: s.grade?.name || "",
          classroom: s.classroom?.name || "",
          parent: parent
            ? {
                _id: parent._id,
                name: fullName(parent),
                username: parent.username,
                phoneNumber: parent.phoneNumber,
                active: parent.active !== false,
                children: childrenOf.get(String(parent._id)) || 0,
              }
            : null,
        };
      })
      .sort(
        (a, b) =>
          a.grade.localeCompare(b.grade, "ar") ||
          a.classroom.localeCompare(b.classroom, "ar", { numeric: true }) ||
          a.name.localeCompare(b.name, "ar"),
      );

    return res.status(200).json({ success: true, data: { school: school.name, students: rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// What linking to this phone would do, before the admin confirms it.
exports.lookupParent = async (req, res) => {
  try {
    const school = await loadSchool(req, res);
    if (!school) return undefined;

    const phone = readPhone(req.query.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: "رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015." });
    }

    const parent = await parentByPhone(phone);
    if (!parent) return res.status(200).json({ success: true, data: { phone, parent: null } });
    if (String(parent.school) !== String(school._id)) {
      return res.status(200).json({ success: true, data: { phone, parent: null, otherSchool: true } });
    }
    return res.status(200).json({ success: true, data: { phone, parent: await describeParent(parent) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Puts a student under the parent account of the phone given: that parent's
// existing account, or a new one (named in the request) when the phone has
// none. The student's previous parent keeps their account and their other
// children.
//
// Every check runs before anything is written. The writes that follow are
// the new account (if any) and then the link itself; should the link fail,
// the account made for it is removed again, so nothing is left half done.
exports.linkStudent = async (req, res) => {
  let created = null;
  try {
    const school = await loadSchool(req, res);
    if (!school) return undefined;

    const fail = (status, message) => res.status(status).json({ success: false, message });

    if (!mongoose.Types.ObjectId.isValid(req.params.studentId)) return fail(404, "الطالب غير موجود.");
    const student = await Student.findOne({ _id: req.params.studentId, school: school._id });
    if (!student) return fail(404, "الطالب غير موجود في المدرسة دي.");

    const phone = readPhone(req.body.phone);
    if (!phone) return fail(400, "رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015.");

    let parent = await parentByPhone(phone);
    let credentials = null;

    if (parent && String(parent.school) !== String(school._id)) {
      return fail(400, "الرقم ده متسجل لولي أمر في مدرسة تانية، ومينفعش يتربط هنا.");
    }
    if (parent && String(parent._id) === String(student.parent)) {
      return fail(400, "الطالب مربوط بالحساب ده بالفعل.");
    }

    if (!parent) {
      const firstName = String(req.body.firstName || "").trim();
      const lastName = String(req.body.lastName || "").trim();
      if (!firstName) return fail(400, "اكتب اسم ولي الأمر عشان يتعمله حساب جديد.");

      const username = await resolveUsername(phone, User);
      const password = generateReadablePassword();
      parent = await User.create({
        firstName,
        lastName: lastName || "-",
        phoneNumber: phone,
        role: "parent",
        school: school._id,
        username,
        password,
        active: true,
      });
      created = parent;
      credentials = { username, password };
    }

    const previousId = student.parent;
    // Only the link changes — an older record missing a field validation now
    // asks for must not block it.
    await Student.updateOne({ _id: student._id }, { $set: { parent: parent._id } });
    created = null;
    if (previousId) {
      await User.updateOne({ _id: previousId }, { $pull: { linkedStudents: student._id } });
    }
    await User.updateOne({ _id: parent._id }, { $addToSet: { linkedStudents: student._id } });

    const previousLeft = previousId ? await Student.countDocuments({ parent: previousId }) : 0;

    const previous = previousId ? await User.findById(previousId).select("firstName lastName username").lean() : null;

    return res.status(200).json({
      success: true,
      message: credentials
        ? "اتعمل حساب ولي أمر جديد واتربط بيه الطالب. اديله بيانات الدخول دي — كلمة السر مش هتظهر تاني."
        : `الطالب اتربط بحساب ${fullName(parent)}.`,
      data: {
        student: { _id: student._id, name: fullName(student) },
        parent: await describeParent(parent),
        credentials,
        previous: previous
          ? { name: fullName(previous), username: previous.username, childrenLeft: previousLeft }
          : null,
      },
    });
  } catch (err) {
    if (created) await User.deleteOne({ _id: created._id }).catch(() => {});
    return res.status(400).json({ success: false, message: err.message });
  }
};

// A new password for a parent who lost theirs. The username stays the same;
// the old password stops working at once.
exports.reissueParentPassword = async (req, res) => {
  try {
    const school = await loadSchool(req, res);
    if (!school) return undefined;

    if (!mongoose.Types.ObjectId.isValid(req.params.parentId)) {
      return res.status(404).json({ success: false, message: "ولي الأمر غير موجود." });
    }
    let parent = await User.findOne({ _id: req.params.parentId, role: "parent", school: school._id });
    if (parent?.mergedInto) parent = await User.findById(parent.mergedInto);
    if (!parent) {
      return res.status(404).json({ success: false, message: "ولي الأمر غير موجود في المدرسة دي." });
    }

    const password = generateReadablePassword();
    parent.password = password;
    await parent.save();

    return res.status(200).json({
      success: true,
      message: "اتعملت كلمة سر جديدة. اديها لولي الأمر دلوقتي — مش هتظهر تاني، والقديمة بطلت.",
      data: {
        parent: await describeParent(parent),
        credentials: { username: parent.username, password },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
