const StaffCandidate = require("../models/StaffCandidate");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { normalizeArabicName } = require("../utils/arabicName");
const { scopeFilter } = require("../utils/tenant");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (value) => normalizeArabicName(value).replace(/\s+/g, "");

// Which of the school's own subjects a label from the file names: the same
// name (spelling variance folded away — "لغة عربيه" is "لغة عربية"), or the
// subject's code ("E"). Nothing looser than that: a school runs "Math" and
// "رياضيات" as different subjects for its two tracks, and guessing between
// them would put a teacher on the wrong one.
const matchSubjects = (label, subjects) => {
  if (!label) return [];
  const wanted = fold(label);
  const code = String(label).trim().toUpperCase();

  return subjects
    .filter((s) => fold(s.name) === wanted || (s.code && s.code === code))
    .map((s) => ({ _id: s._id, name: s.name }));
};

// The teacher registration form's "find this teacher on the staff list"
// box. Same shape as the admissions search: with no query it answers only
// how many are still waiting (a school with no list never sees the box);
// with one it returns up to ten matches on any part of the name.
exports.searchStaffCandidates = async (req, res) => {
  try {
    const filter = scopeFilter(req, { registeredUser: null });
    if (!filter) {
      return res.status(400).json({
        success: false,
        message: "Please specify a school (?school=id) to search its staff list.",
      });
    }

    const pending = await StaffCandidate.countDocuments(filter);
    const q = normalizeArabicName(req.query.q || "");

    if (q.length < 2) {
      return res.status(200).json({ success: true, pending, data: [] });
    }

    const [candidates, subjects] = await Promise.all([
      StaffCandidate.find({ ...filter, normalizedName: { $regex: escapeRegExp(q) } })
        .sort({ normalizedName: 1 })
        .limit(10)
        .lean(),
      Subject.find({ school: filter.school }).select("name code").lean(),
    ]);

    // A phone already on a teacher account can't take a second one — say
    // so before the admin fills the rest of the form in.
    const taken = new Set(
      (
        await User.find({
          role: "teacher",
          phoneNumber: { $in: candidates.flatMap((c) => c.phones) },
        }).select("phoneNumber")
      ).map((u) => u.phoneNumber),
    );

    res.status(200).json({
      success: true,
      pending,
      data: candidates.map((c) => ({
        _id: c._id,
        fullName: c.fullName,
        firstName: c.firstName,
        lastName: c.lastName,
        subjectLabel: c.subjectLabel,
        subjects: matchSubjects(c.subjectLabel, subjects),
        nationalId: c.nationalId,
        email: c.email,
        phones: c.phones.map((number) => ({ number, taken: taken.has(number) })),
        invalidPhones: c.invalidPhones,
        primaryPhone: c.phones.find((p) => !taken.has(p)) || "",
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
