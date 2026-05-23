const Behavior = require("../models/Behavior");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");

  const schedules = await Schedule.find({
    teacher: teacherId,
    classroom: classroomId,
    day: dayName
  });

  return schedules.find((sch) => {
    const start = timeToMinutes(sch.startTime);
    const end = timeToMinutes(sch.endTime);
    return currentTimeInMinutes >= start && currentTimeInMinutes <= end;
  });

exports.recordBulkBehavior = async (req, res) => {
  try {
    const { scheduleId, behaviorRecords } = req.body; 

    const currentSchedule = await Schedule.findById(scheduleId);
    
    if (!currentSchedule || currentSchedule.teacher.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: "عفواً، هذه الحصة غير مسجلة باسمك ولا يمكنك تقييم طلابها." 
      });
    }

    const validRecords = behaviorRecords.filter(r => r.type && r.note && r.note.trim().length > 0);

    if (validRecords.length === 0) {
      return res.status(400).json({ message: "يجب اختيار نوع السلوك وكتابة ملاحظة لكل طالب يتم تقييمه." });
    }

    const bulkData = validRecords.map(record => ({
      student: record.studentId,
      teacher: req.user.id,
      subject: currentSchedule.subject, 
      type: record.type,
      note: record.note,
      date: new Date() 
    }));

    await Behavior.insertMany(bulkData);

    res.status(201).json({
      success: true,
      message: `تم تسجيل ملاحظات السلوك لعدد (${validRecords.length}) طالب بنجاح.`
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.getAllBehavior = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'teacher') {
      filter = { teacher: req.user.id };
    }

const data = await Behavior.find(filter)
      .populate({
        path: "student",
        select: "firstName lastName grade",
        populate: { path: "grade", select: "name academicYear" } 
      })
      .populate("teacher", "firstName lastName") 
      .populate("subject", "name");

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.getStudentBehavior = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

    if (req.user.role === 'parent' && student.parent.toString() !== req.user.id) {
      return res.status(403).json({ message: "عفواً، لا يمكنك استعراض سجل طالب ليس من أبنائك." });
    }

    const data = await Behavior.find({ student: studentId })
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .sort({ createdAt: -1 });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteBehavior = async (req, res) => {
  try {
    const behavior = await Behavior.findById(req.params.id);
    if (!behavior) return res.status(404).json({ message: "سجل السلوك غير موجود" });

    if (req.user.role === 'teacher' && behavior.teacher.toString() !== req.user.id) {
        return res.status(403).json({ message: "لا يمكنك حذف تقييم سلوكي كتبه معلم آخر" });
    }

    await behavior.deleteOne();
    res.json({ success: true, message: "تم حذف السجل بنجاح" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};