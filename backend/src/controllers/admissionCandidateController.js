const AdmissionCandidate = require("../models/AdmissionCandidate");
const Student = require("../models/Student");
const User = require("../models/User");
const { normalizeArabicName } = require("../utils/arabicName");
const { scopeFilter } = require("../utils/tenant");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The phone a candidate should be registered under, decided at the moment
// of registration rather than at import — parent accounts keep appearing as
// siblings get registered, and an existing account always wins:
//
// 1. The parent account a brother or sister from the same household was
//    already registered under — even when that account's number isn't
//    among this child's (a sheet can list the family's other number).
// 2. A number of theirs that already belongs to a parent at this school —
//    the child is joining a family already registered.
// 3. Otherwise the household's shared number picked at import.
// 4. Otherwise their first readable number.
//
// A number held by a parent at another school is never offered: that
// account can't be linked here, and registration would be refused.
const choosePhone = (candidate, parentsByPhone, school, familyParent) => {
  if (familyParent) return { phone: familyParent.phoneNumber, existingParent: familyParent };

  const usable = candidate.phones.filter((p) => {
    const owner = parentsByPhone.get(p);
    return !owner || String(owner.school) === String(school);
  });
  const linked = usable.find((p) => parentsByPhone.has(p));
  if (linked) return { phone: linked, existingParent: parentsByPhone.get(linked) };
  if (candidate.primaryPhone && usable.includes(candidate.primaryPhone)) {
    return { phone: candidate.primaryPhone, existingParent: null };
  }
  return { phone: usable[0] || "", existingParent: null };
};

// The registration form's "find this child on the admissions list" box.
// Matches any part of the name, so "مريم محمد" and "سيد ابراهيم" both find
// "مريم محمد احمد سيد ابراهيم". Children already registered are left out —
// the list shrinks as registration goes on.
//
// With no query it returns only the count still waiting, which the form
// uses to decide whether to show the box at all (a school with no list
// never sees it).
exports.searchCandidates = async (req, res) => {
  try {
    const filter = scopeFilter(req, { registeredStudent: null }, "grade");
    if (!filter) {
      return res.status(400).json({
        success: false,
        message: "Please specify a school (?school=id) to search its admissions list.",
      });
    }

    const pending = await AdmissionCandidate.countDocuments(filter);
    const q = normalizeArabicName(req.query.q || "");

    if (q.length < 2) {
      return res.status(200).json({ success: true, pending, data: [] });
    }

    const candidates = await AdmissionCandidate.find({
      ...filter,
      normalizedName: { $regex: escapeRegExp(q) },
    })
      .populate("grade", "name")
      .sort({ normalizedName: 1 })
      .limit(10)
      .lean();

    const phones = [...new Set(candidates.flatMap((c) => c.phones))];
    const households = [...new Set(candidates.map((c) => c.household).filter(Boolean))];

    const [parents, siblings] = await Promise.all([
      User.find({ role: "parent", phoneNumber: { $in: phones } })
        .select("firstName lastName phoneNumber school linkedStudents")
        .lean(),
      AdmissionCandidate.find({ school: filter.school, household: { $in: households } })
        .select("studentName household sheetLabel registeredStudent")
        .lean(),
    ]);
    const parentsByPhone = new Map(parents.map((p) => [p.phoneNumber, p]));

    // The parent account each household's already-registered children sit
    // under, by household.
    const registeredSiblings = siblings.filter((s) => s.registeredStudent);
    const siblingStudents = await Student.find({
      _id: { $in: registeredSiblings.map((s) => s.registeredStudent) },
      school: filter.school,
    })
      .select("parent")
      .populate("parent", "firstName lastName phoneNumber school linkedStudents")
      .lean();
    const parentByStudent = new Map(siblingStudents.map((s) => [String(s._id), s.parent]));
    const familyParentOf = new Map();
    for (const s of registeredSiblings) {
      const p = parentByStudent.get(String(s.registeredStudent));
      if (p && !familyParentOf.has(s.household)) familyParentOf.set(s.household, p);
    }

    const data = candidates.map((c) => {
      const familyParent = c.household ? familyParentOf.get(c.household) : null;
      const { phone, existingParent } = choosePhone(c, parentsByPhone, filter.school, familyParent);
      return {
        _id: c._id,
        studentName: c.studentName,
        firstName: c.firstName,
        lastName: c.lastName,
        gender: c.gender,
        grade: c.grade,
        sheetLabel: c.sheetLabel,
        birthDate: c.birthDate,
        nationalId: c.nationalId,
        religion: c.religion,
        address: c.address,
        parentName: c.parentName,
        parentFirstName: c.parentFirstName,
        parentLastName: c.parentLastName,
        parentJob: c.parentJob,
        // The family account's number leads the list when the sheet
        // didn't have it, so the form can still show it as the pick.
        phones: [...new Set([phone, ...c.phones].filter(Boolean))].map((p) => ({
          number: p,
          otherSchool:
            !!parentsByPhone.get(p) &&
            String(parentsByPhone.get(p).school) !== String(filter.school),
        })),
        invalidPhones: c.invalidPhones,
        primaryPhone: phone,
        existingParent: existingParent && {
          name: `${existingParent.firstName} ${existingParent.lastName}`,
          children: existingParent.linkedStudents?.length || 0,
        },
        siblings: siblings
          .filter((s) => c.household && s.household === c.household && String(s._id) !== String(c._id))
          .map((s) => ({
            studentName: s.studentName,
            sheetLabel: s.sheetLabel,
            registered: !!s.registeredStudent,
          })),
      };
    });

    res.status(200).json({ success: true, pending, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
