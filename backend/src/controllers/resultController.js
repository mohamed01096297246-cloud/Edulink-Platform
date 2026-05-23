const Result = require("../models/Result");
const Student = require("../models/Student");

exports.addBulkGrades = async (req, res) => {
  try {
    const { examId, subjectId, classroomId, gradesList } = req.body; 

    if (!examId || !subjectId || !classroomId || !gradesList || !Array.isArray(gradesList)) {
      return res.status(400).json({ 
        message: "يجب إرسال جميع البيانات المطلوبة (الامتحان، المادة، الفصل، وقائمة الدرجات)." 
      });
    }

    if (gradesList.length === 0) {
      return res.status(400).json({ message: "قائمة الدرجات فارغة." });
    }

    const hasInvalidGrades = gradesList.some(
      record => record.grade === undefined || record.grade === null || record.grade === "" || record.grade < 0 || record.grade > 100
    );

    if (hasInvalidGrades) {
      return res.status(400).json({ 
        message: "عفواً، يجب إدخال درجة صحيحة (بين 0 و 100) لكل طالب، لا يمكن ترك أي حقل فارغ." 
      });
    }

    const studentsInClassCount = await Student.countDocuments({ classroom: classroomId });
    
    if (gradesList.length !== studentsInClassCount) {
      return res.status(400).json({
        message: `عدد الطلاب المرسل (${gradesList.length}) لا يطابق عدد طلاب الفصل الفعلي (${studentsInClassCount}). يجب رصد الدرجات لجميع الطلاب.`
      });
    }

    const bulkOps = gradesList.map((record) => ({
      updateOne: {
        filter: { student: record.studentId, exam: examId, subject: subjectId },
        update: { 
          $set: { 
            grade: Number(record.grade), // التأكد من حفظها كرقم
            teacher: req.user.id 
          } 
        },
        upsert: true
      }
    }));

    await Result.bulkWrite(bulkOps);

    res.status(200).json({ 
      success: true, 
      message: `تم رصد وتوثيق الدرجات لجميع طلاب الفصل بنجاح (العدد: ${gradesList.length} طالب).` 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getReportCard = async (req, res) => {
  try {
    const { studentId, examId } = req.params;

    const student = await Student.findById(studentId)
      .populate("parent", "firstName lastName")
      .populate("grade", "name academicYear") 
      .populate("classroom", "name");        

    if (!student) {
      return res.status(404).json({ message: "الطالب غير موجود في النظام" });
    }

 if (req.user.role === 'parent' && student.parent._id.toString() !== req.user.id) {
  return res.status(403).json({ message: "عفواً، لا يمكنك استعراض نتائج طالب ليس من أبنائك." });
}

    const grades = await Result.find({ student: studentId, exam: examId })
      .populate("exam", "title academicYear")
      .populate("subject", "name");

    if (grades.length === 0) {
      return res.status(404).json({ message: "لم يتم رصد درجات لهذا الطالب في هذا الامتحان بعد." });
    }

    let totalStudentMarks = 0;
    let totalMaxMarks = grades.length * 100;

    grades.forEach(g => {
      totalStudentMarks += g.grade;
    });

    res.status(200).json({
      success: true,
      data: {
        reportTitle: `نتائج امتحان الطالب ${student.firstName} في ${grades[0].exam.title}`,
        academicYear: grades[0].exam.academicYear,
        subjects: grades,
        summary: {
          studentTotal: totalStudentMarks,
          maxTotal: totalMaxMarks,
          percentage: ((totalStudentMarks / totalMaxMarks) * 100).toFixed(2) + "%"
        }
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateGrade = async (req, res) => {
  try {
    const { id } = req.params; 
    const { grade } = req.body;

    if (grade === undefined || grade === null || grade < 0 || grade > 100) {
      return res.status(400).json({ message: "الدرجة يجب أن تكون رقماً بين 0 و 100" });
    }

    const updatedResult = await Result.findByIdAndUpdate(
      id,
      { 
        grade: Number(grade), 
        updatedBy: req.user.id 
      },
      { new: true, runValidators: true }
    )
    .populate({
      path: "student",
      select: "firstName lastName",
      populate: [
        { path: "grade", select: "name academicYear" },
        { path: "classroom", select: "name" }
      ]
    })
    .populate("subject", "name")
    .populate("exam", "title academicYear");

    if (!updatedResult) {
      return res.status(404).json({ message: "سجل الدرجة غير موجود" });
    }

    res.status(200).json({
      success: true,
      message: "تم تعديل الدرجة بنجاح ",
      data: updatedResult
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteGrade = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Result.findByIdAndDelete(id);

    if (!result) return res.status(404).json({ message: "السجل غير موجود بالفعل" });

    res.status(200).json({ success: true, message: "تم حذف سجل الدرجة نهائياً" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};