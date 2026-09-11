const ContactDirectory = require("../models/ContactDirectory");
const { normalizeArabicName } = require("../utils/arabicName");
const { scopeFilter } = require("../utils/tenant");

// Escapes a string for safe use inside a RegExp — the search text is
// whatever an admin is mid-typing into the new-student name field, not
// something meant to be interpreted as a pattern.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Looks up the household contact record by the CHILD's name, for the
// registration screen's "we found this kid in the phone directory, want to
// use it?" suggestion. Prefix match on the normalized name — an admin
// midway through typing "رزان احمد" should already see "رزان احمد شايف
// علي" show up, not need to finish the whole name first.
exports.searchByStudentName = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (q.length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const filter = scopeFilter(req);
    if (!filter) {
      return res.status(400).json({
        success: false,
        message: "Please specify a school (?school=id) to search its directory.",
      });
    }

    const normalizedQuery = normalizeArabicName(q);

    const results = await ContactDirectory.find({
      ...filter,
      normalizedName: { $regex: `^${escapeRegExp(normalizedQuery)}` },
    })
      .select("studentName fatherPhone motherPhone address gradeLabel")
      .sort({ studentName: 1 })
      .limit(8);

    res.status(200).json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
