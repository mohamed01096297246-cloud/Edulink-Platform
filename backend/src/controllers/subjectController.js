const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const User = require("../models/User");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

// Accepts either the new `grades` array or a lone `grade`, so an older admin
// build posting one grade keeps working while the web app is redeployed.
const readGrades = (body) => {
  if (Array.isArray(body.grades)) return body.grades.filter(Boolean);
  if (body.grade) return [body.grade];
  return [];
};

// A subject has to be taught to somebody: either every grade in the school,
// or a named set of them.
const validateCoverage = ({ grades, allGrades }) => {
  if (allGrades) return null;
  if (grades.length === 0) {
    return "اختر المراحل التي تُدرَّس لها هذه المادة، أو فعّل خيار «كل المراحل».";
  }
  return null;
};

exports.createSubject = async (req, res) => {
  try {
    const { name, code } = req.body;
    const allGrades = Boolean(req.body.allGrades);
    const grades = allGrades ? [] : readGrades(req.body);
    const school = creationSchool(req);

    if (!name || !code) {
      return res.status(400).json({ message: "اسم المادة وكودها مطلوبان." });
    }
    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a subject for.",
      });
    }

    const coverageError = validateCoverage({ grades, allGrades });
    if (coverageError) {
      return res.status(400).json({ message: coverageError });
    }

    // Grades must belong to the same school — otherwise a subject could be
    // pointed at another school's grade and quietly leak across the tenant
    // boundary every other query here is careful to respect.
    if (grades.length > 0) {
      const valid = await Grade.countDocuments({
        _id: { $in: grades },
        school,
      });
      if (valid !== grades.length) {
        return res
          .status(400)
          .json({ message: "بعض المراحل المختارة غير موجودة في هذه المدرسة." });
      }
    }

    const existingCode = await Subject.findOne({
      code: code.trim().toUpperCase(),
      school,
    });
    if (existingCode) {
      return res
        .status(400)
        .json({ message: "كود المادة مستخدم بالفعل." });
    }

    const existingName = await Subject.findOne({ name: name.trim(), school });
    if (existingName) {
      return res.status(400).json({
        message:
          "في مادة بنفس الاسم بالفعل. عدّل مراحلها بدل ما تنشئ واحدة جديدة.",
      });
    }

    const subject = await Subject.create({
      name: name.trim(),
      code,
      grades,
      allGrades,
      school,
    });

    const populated = await Subject.findById(subject._id).populate(
      "grades",
      "name academicYear",
    );

    res
      .status(201)
      .json({ message: "Subject created successfully", subject: populated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "This subject already exists." });
    }
    res.status(400).json({ error: err.message });
  }
};

exports.getAllSubjects = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its subjects.",
      });
    }

    // ?grade=<id> now means "subjects taught to this grade", which includes
    // every school-wide subject as well as those naming it explicitly.
    if (req.query.grade) {
      Object.assign(filter, Subject.coveringGrade(req.query.grade));
    }

    const subjects = await Subject.find(filter)
      .populate("grades", "name academicYear")
      .sort({ name: 1 });

    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const existing = await Subject.findById(req.params.id);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const update = {};

    if (req.body.name !== undefined) update.name = req.body.name.trim();
    if (req.body.code !== undefined) update.code = req.body.code;

    // Coverage is only touched when the request actually says something
    // about it — a rename must not silently blank out a subject's grades.
    const mentionsCoverage =
      req.body.allGrades !== undefined ||
      req.body.grades !== undefined ||
      req.body.grade !== undefined;

    if (mentionsCoverage) {
      const allGrades = Boolean(req.body.allGrades);
      const grades = allGrades ? [] : readGrades(req.body);

      const coverageError = validateCoverage({ grades, allGrades });
      if (coverageError) {
        return res.status(400).json({ message: coverageError });
      }

      if (grades.length > 0) {
        const valid = await Grade.countDocuments({
          _id: { $in: grades },
          school: existing.school,
        });
        if (valid !== grades.length) {
          return res.status(400).json({
            message: "بعض المراحل المختارة غير موجودة في هذه المدرسة.",
          });
        }
      }

      update.grades = grades;
      update.allGrades = allGrades;
    }

    if (update.code) {
      const conflict = await Subject.findOne({
        _id: { $ne: req.params.id },
        school: existing.school,
        code: update.code.trim().toUpperCase(),
      });
      if (conflict) {
        return res.status(400).json({ message: "كود المادة مستخدم بالفعل." });
      }
    }

    if (update.name) {
      const conflict = await Subject.findOne({
        _id: { $ne: req.params.id },
        school: existing.school,
        name: update.name,
      });
      if (conflict) {
        return res
          .status(400)
          .json({ message: "في مادة بنفس الاسم بالفعل في هذه المدرسة." });
      }
    }

    const subject = await Subject.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate("grades", "name academicYear");

    res.json({ message: "Subject updated successfully", subject });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject || !sameSchool(req, subject)) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const teachersCount = await User.countDocuments({
      role: "teacher",
      subjects: subject._id,
    });

    if (teachersCount > 0) {
      return res.status(400).json({
        message:
          "cannot delete this subject because there are teachers assigned to it. Please reassign or remove those teachers first.",
      });
    }

    await subject.deleteOne();
    res.json({ message: "Subject deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
