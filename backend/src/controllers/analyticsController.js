const Result = require("../models/Result");
const { scopeFilter } = require("../utils/tenant");

const PASS_THRESHOLD = 50;

// Groups an array of populated Results by a key, returning per-group
// average/min/max/pass-rate. Shared by every breakdown below so the numbers
// (and the pass-rate definition) stay consistent across the report.
const summarize = (results, keyFn, labelFn) => {
  const groups = new Map();

  for (const r of results) {
    const key = keyFn(r);
    if (key === null || key === undefined) continue;

    if (!groups.has(key)) {
      groups.set(key, { label: labelFn(r), grades: [] });
    }
    groups.get(key).grades.push(r.grade);
  }

  return Array.from(groups.entries())
    .map(([id, { label, grades }]) => {
      const count = grades.length;
      const sum = grades.reduce((a, b) => a + b, 0);
      const passCount = grades.filter((g) => g >= PASS_THRESHOLD).length;

      return {
        id,
        label,
        count,
        average: Number((sum / count).toFixed(1)),
        min: Math.min(...grades),
        max: Math.max(...grades),
        passRate: Number(((passCount / count) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => a.average - b.average);
};

// Report on exam results — averages, pass rates, and the weak spots, broken
// down by subject/classroom/teacher. Built as a read layer over the same
// Result documents grading already produces; no new data entry required.
exports.getExamAnalytics = async (req, res) => {
  try {
    const extra = {};
    if (req.query.examId) extra.exam = req.query.examId;

    const filter = scopeFilter(req, extra);
    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) for this report.",
      });
    }

    let results = await Result.find(filter)
      .populate("subject", "name")
      .populate("teacher", "firstName lastName")
      .populate("exam", "title academicYear examType")
      .populate({
        path: "student",
        select: "firstName lastName classroom",
        populate: { path: "classroom", select: "name" },
      });

    if (req.query.academicYear) {
      results = results.filter(
        (r) => r.exam?.academicYear === req.query.academicYear,
      );
    }

    if (results.length === 0) {
      return res.status(200).json({
        totalResults: 0,
        overallAverage: 0,
        overallPassRate: 0,
        bySubject: [],
        byClassroom: [],
        byTeacher: [],
        weakestSubject: null,
        strongestSubject: null,
      });
    }

    const grades = results.map((r) => r.grade);
    const overallAverage = Number(
      (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1),
    );
    const overallPassRate = Number(
      (
        (grades.filter((g) => g >= PASS_THRESHOLD).length / grades.length) *
        100
      ).toFixed(1),
    );

    const bySubject = summarize(
      results,
      (r) => r.subject?._id?.toString(),
      (r) => r.subject?.name || "Unknown subject",
    );

    const byClassroom = summarize(
      results,
      (r) => r.student?.classroom?._id?.toString(),
      (r) => r.student?.classroom?.name || "Unassigned classroom",
    );

    const byTeacher = summarize(
      results,
      (r) => r.teacher?._id?.toString(),
      (r) => (r.teacher ? `${r.teacher.firstName} ${r.teacher.lastName}` : "Unknown teacher"),
    );

    res.status(200).json({
      totalResults: results.length,
      overallAverage,
      overallPassRate,
      bySubject,
      byClassroom,
      byTeacher,
      weakestSubject: bySubject[0] || null,
      strongestSubject: bySubject[bySubject.length - 1] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
