const StaffCandidate = require("../models/StaffCandidate");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const User = require("../models/User");
const { normalizeArabicName } = require("../utils/arabicName");
const { scopeFilter } = require("../utils/tenant");
const {
  generateAccountCode,
  generateReadablePassword,
} = require("../utils/generateCredentials");

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

// ---------------------------------------------------------------------------
// Coded teacher accounts, issued in bulk off the staff list — the teachers'
// counterpart of student accounts (see studentAccountController). The list
// has names, subjects and phones but no national IDs or emails, so instead
// of registering teachers one form at a time, the school issues every one a
// six-digit code and a readable password in one go and prints the sheet.
// ---------------------------------------------------------------------------

// The grades a teacher of these subjects teaches: whatever grades the
// subjects themselves cover, or every grade of the school for a subject
// taught school-wide. A principal narrows it later if a teacher only takes
// some of them.
const gradesForSubjects = async (school, subjects) => {
  if (subjects.some((s) => s.allGrades)) {
    return Grade.find({ school }).distinct("_id");
  }
  return [...new Set(subjects.flatMap((s) => (s.grades || []).map(String)))];
};

// Everyone on the list, with where they stand: already has an account (and
// its code), can be issued one, or can't — no subject of the school's
// matches what the list says they teach. Never includes a password.
exports.listStaffAccounts = async (req, res) => {
  try {
    const filter = scopeFilter(req);
    if (!filter) {
      return res.status(400).json({ success: false, message: "Please specify a school." });
    }

    const [candidates, subjects] = await Promise.all([
      StaffCandidate.find(filter).sort({ serial: 1, normalizedName: 1 }).lean(),
      Subject.find({ school: filter.school }).select("name code").lean(),
    ]);
    const accounts = await User.find({
      _id: { $in: candidates.map((c) => c.registeredUser).filter(Boolean) },
      role: "teacher",
    })
      .select("username")
      .lean();
    const usernameOf = new Map(accounts.map((a) => [String(a._id), a.username]));

    res.status(200).json({
      success: true,
      data: candidates.map((c) => {
        const matched = matchSubjects(c.subjectLabel, subjects);
        return {
          _id: c._id,
          serial: c.serial,
          fullName: c.fullName,
          subjectLabel: c.subjectLabel,
          subjects: matched.map((s) => s.name),
          phone: c.phones[0] || "",
          hasAccount: !!c.registeredUser,
          username: c.registeredUser ? usernameOf.get(String(c.registeredUser)) || null : null,
          issuable: !c.registeredUser && matched.length > 0,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Issues a teacher account to everyone on the list (or the ones picked) who
// doesn't have one yet and whose subject the school has. Returns the
// credentials ONCE — passwords are stored hashed, so this response is the
// only time they can be read, and the screen must have them printed.
exports.issueStaffAccounts = async (req, res) => {
  try {
    const filter = scopeFilter(req, { registeredUser: null });
    if (!filter) {
      return res.status(400).json({ success: false, message: "Please specify a school." });
    }
    const picked = Array.isArray(req.body?.candidates) ? req.body.candidates : null;
    if (picked?.length) filter._id = { $in: picked };

    const [candidates, subjects] = await Promise.all([
      StaffCandidate.find(filter).sort({ serial: 1, normalizedName: 1 }),
      Subject.find({ school: filter.school }).select("name code grades allGrades").lean(),
    ]);

    const issued = [];
    const skipped = [];

    for (const candidate of candidates) {
      const matched = matchSubjects(candidate.subjectLabel, subjects);
      if (!matched.length) {
        skipped.push({
          fullName: candidate.fullName,
          reason: `مفيش مادة «${candidate.subjectLabel || "—"}» في المدرسة`,
        });
        continue;
      }
      const subjectDocs = subjects.filter((s) =>
        matched.some((m) => String(m._id) === String(s._id)),
      );

      // A number already on another teacher's account stays with them —
      // this one simply goes without, and signs in with the code anyway.
      // eslint-disable-next-line no-await-in-loop -- a staff list is a few
      // dozen people; sequential keeps each code check honest.
      const takenPhones = await User.find({
        role: "teacher",
        phoneNumber: { $in: candidate.phones },
      }).distinct("phoneNumber");
      const phoneNumber = candidate.phones.find((p) => !takenPhones.includes(p));

      // eslint-disable-next-line no-await-in-loop -- as above.
      const username = await generateAccountCode(User);
      const password = generateReadablePassword();
      // eslint-disable-next-line no-await-in-loop -- as above.
      const teachingGrades = await gradesForSubjects(candidate.school, subjectDocs);

      // eslint-disable-next-line no-await-in-loop -- as above.
      const teacher = await User.create({
        firstName: candidate.firstName || candidate.fullName,
        lastName: candidate.lastName || "-",
        ...(phoneNumber ? { phoneNumber } : {}),
        role: "teacher",
        school: candidate.school,
        subjects: subjectDocs.map((s) => s._id),
        teachingGrades,
        username,
        password,
        active: true,
      });

      candidate.registeredUser = teacher._id;
      candidate.registeredAt = new Date();
      // eslint-disable-next-line no-await-in-loop -- as above.
      await candidate.save();

      issued.push({
        candidate: candidate._id,
        fullName: candidate.fullName,
        subject: subjectDocs.map((s) => s.name).join("، "),
        username,
        password,
      });
    }

    res.status(201).json({
      success: true,
      message: issued.length
        ? `تم إصدار بيانات دخول لعدد ${issued.length} معلم. اطبع الكشف الآن — كلمات المرور لا يمكن عرضها مرة أخرى.`
        : "مفيش معلمين محتاجين حسابات في القائمة دي.",
      skipped,
      data: issued,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// A lost password can't be read back, only replaced. The code stays, so
// whatever the school has already written down still works.
exports.reissueStaffPassword = async (req, res) => {
  try {
    const filter = scopeFilter(req, { _id: req.params.id });
    const candidate = filter ? await StaffCandidate.findOne(filter) : null;
    if (!candidate?.registeredUser) {
      return res.status(404).json({
        success: false,
        message: "المعلم ده لسه ملوش حساب — أصدر له بيانات دخول الأول.",
      });
    }

    const teacher = await User.findOne({ _id: candidate.registeredUser, role: "teacher" });
    if (!teacher) {
      return res.status(404).json({ success: false, message: "حساب المعلم غير موجود." });
    }

    const password = generateReadablePassword();
    teacher.password = password;
    teacher.active = true;
    await teacher.save();

    res.status(200).json({
      success: true,
      message: "تم إصدار كلمة مرور جديدة. اطبعها الآن — لن تظهر مرة أخرى.",
      data: {
        candidate: candidate._id,
        fullName: candidate.fullName,
        subject: candidate.subjectLabel,
        username: teacher.username,
        password,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
