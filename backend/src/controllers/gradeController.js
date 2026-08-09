const Grade = require("../models/Grade");

exports.createGrade = async (req, res) => {
  try {
    const { name, academicYear } = req.body;

    const grade = await Grade.create({ name, academicYear });

    res.status(201).json({
      success: true,
      message: "Grade created successfully",
      data: grade,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAllGrades = async (req, res) => {
  try {
    const grades = await Grade.find();
    res.status(200).json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateGrade = async (req, res) => {
  try {
    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!grade) return res.status(404).json({ message: "Grade not found" });
    res.status(200).json({
      success: true,
      message: "Grade updated successfully",
      data: grade,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const grade = await Grade.findByIdAndDelete(req.params.id);
    if (!grade) return res.status(404).json({ message: "Grade not found" });
    res
      .status(200)
      .json({ success: true, message: "Grade deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
