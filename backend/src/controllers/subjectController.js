const Subject = require("../models/Subject");
const User = require("../models/User");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createSubject = async (req, res) => {
  try {
    const { name, code, grade } = req.body;
    const school = creationSchool(req);

    if (!name || !code || !grade) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a subject for.",
      });
    }

    const existingCode = await Subject.findOne({
      code: code.trim().toUpperCase(),
      school,
    });
    if (existingCode) {
      return res
        .status(400)
        .json({ message: "Subject code is already registered" });
    }

    const existingNameInGrade = await Subject.findOne({ name, grade, school });
    if (existingNameInGrade) {
      return res.status(400).json({
        message: `Subject with this name already exists in the selected grade.`,
      });
    }
    const subject = await Subject.create({ name, code, grade, school });
    res.status(201).json({ message: "Subject created successfully", subject });
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
    if (req.query.grade) {
      filter.grade = req.query.grade;
    }

    const subjects = await Subject.find(filter)
      .populate("grade", "name academicYear")
      .sort({ grade: 1, name: 1 });
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const { name, code, grade } = req.body;

    const existing = await Subject.findById(req.params.id);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Subject not found" });
    }

    if (code || (name && grade)) {
      const query = { _id: { $ne: req.params.id }, school: existing.school };
      if (code) query.code = code.trim().toUpperCase();

      const conflict = await Subject.findOne(query);
      if (conflict) {
        return res.status(400).json({
          message: "The new data conflicts with an existing subject.",
        });
      }
    }

    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("grade", "name academicYear");

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
      subject: subject._id,
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
