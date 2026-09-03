const Homework = require("../models/Homework");
const Classroom = require("../models/Classroom");
const User = require("../models/User");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const Subject = require("../models/Subject");
const { scopeFilter, sameSchool } = require("../utils/tenant");
const { sendAlertEmail } = require("../utils/emailService");
const { notifyParentsOfStudents } = require("../utils/notify");

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_NAMES_AR = {
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
  sat: "السبت",
};

// "تسليم الواجب الحصة الجاية" — due date is never picked by hand, it's
// always the next time this exact classroom actually meets for this
// subject. Strictly *next*: if today happens to be the class's day, that
// means the class already met (or is about to) today, so the due date is
// next week's occurrence, not today's.
const nextSessionDate = (dayCode) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetIndex = DAY_INDEX[dayCode];
  let daysAhead = targetIndex - today.getDay();
  if (daysAhead <= 0) daysAhead += 7;

  const result = new Date(today);
  result.setDate(today.getDate() + daysAhead);
  return result;
};

exports.createHomework = async (req, res) => {
  try {
    const { title, pageNumber, totalMarks, grade, classroomId } = req.body;
    const teacher = await User.findById(req.user.id);
    const isAuthorized = teacher.teachingGrades.some(
      (gId) => gId.toString() === grade.toString(),
    );

    if (!isAuthorized) {
      return res
        .status(403)
        .json({
          message: "غير مصرح لك بإضافة واجب لهذه المرحلة.",
        });
    }

    let classrooms;

    if (classroomId) {
      const classroom = await Classroom.findOne({
        _id: classroomId,
        grade: grade,
      });

      if (!classroom) {
        return res.status(404).json({
          message: "هذا الفصل غير موجود ضمن هذه المرحلة.",
        });
      }

      classrooms = [classroom];
    } else {
      classrooms = await Classroom.find({ grade: grade });
    }

    if (classrooms.length === 0) {
      return res
        .status(404)
        .json({
          message: "لا يوجد فصول مسجّلة لهذه المرحلة حاليًا.",
        });
    }

    // Each classroom can meet on a different day even for the same
    // teacher/subject (e.g. فصل 1/1 يوم الأحد، فصل 1/2 يوم الاثنين) — so the
    // due date is computed per classroom, from that classroom's own
    // schedule entries. A classroom can also have *more than one* weekly
    // session of the same subject/teacher (e.g. Sunday AND Monday) — the
    // "next session" is whichever of those actually comes first, not
    // whichever schedule row happened to be read last.
    const schedules = await Schedule.find({
      teacher: req.user.id,
      subject: teacher.subject,
      classroom: { $in: classrooms.map((c) => c._id) },
    });
    const daysByClassroom = new Map();
    schedules.forEach((s) => {
      const key = s.classroom.toString();
      if (!daysByClassroom.has(key)) daysByClassroom.set(key, []);
      daysByClassroom.get(key).push(s.day);
    });

    const homeworkEntries = classrooms.map((cls) => {
      const dayCodes = daysByClassroom.get(cls._id.toString());
      // No schedule found is unexpected (the classroom came from the
      // teacher's own authorized grade) but not fatal — fall back to a
      // week out rather than blocking the whole save.
      const candidateDates = (dayCodes?.length ? dayCodes : ["sun"]).map(
        nextSessionDate,
      );
      const dueDate = new Date(Math.min(...candidateDates.map((d) => d.getTime())));
      const nearestDayCode = dayCodes?.length
        ? dayCodes[candidateDates.findIndex((d) => d.getTime() === dueDate.getTime())]
        : null;

      return {
        title,
        pageNumber,
        totalMarks,
        dueDate,
        classroom: cls._id,
        teacher: req.user.id,
        subject: teacher.subject,
        school: req.user.school,
        _dayCode: nearestDayCode,
      };
    });

    await Homework.insertMany(
      homeworkEntries.map(({ _dayCode, ...entry }) => entry),
    );

    const subjectDoc = await Subject.findById(teacher.subject).select("name");

    // Best-effort notice to parents — never blocks the homework save if it
    // fails partway through.
    notifyParents(homeworkEntries, subjectDoc?.name, title).catch((err) =>
      console.log("Homework creation — parent notify error:", err.message),
    );

    res.status(201).json({
      success: true,
      message: classroomId
        ? "تم إضافة الواجب بنجاح لهذا الفصل"
        : `تم إضافة الواجب بنجاح لـ ${classrooms.length} فصل في هذه المرحلة`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// One notice per classroom (each may have its own due weekday), sent to
// every parent with an active child in that classroom — mirrors the day
// the class meets both ways: the day the homework was assigned *and* the
// day it's due, since the class recurs weekly on the same weekday.
async function notifyParents(homeworkEntries, subjectName, title) {
  for (const entry of homeworkEntries) {
    const dayName = entry._dayCode ? DAY_NAMES_AR[entry._dayCode] : null;

    const message = dayName
      ? `تم تسجيل واجب جديد في مادة ${subjectName || ""}: "${title}". الواجب اتسلّم يوم ${dayName}، وميعاد تسليمه هو نفس اليوم (${dayName}) الأسبوع الجاي.`
      : `تم تسجيل واجب جديد في مادة ${subjectName || ""}: "${title}".`;

    const students = await Student.find({
      classroom: entry.classroom,
      active: true,
    }).populate("parent", "email pushToken");

    const parentsMap = new Map();
    students.forEach((student) => {
      if (student.parent) {
        parentsMap.set(student.parent._id.toString(), student.parent);
      }
    });
    const parents = Array.from(parentsMap.values());

    for (const parent of parents) {
      if (parent.email) {
        await sendAlertEmail(parent.email, "واجب مدرسي جديد", message);
      }
    }

    await notifyParentsOfStudents({
      students,
      type: "homework",
      title: "واجب مدرسي جديد",
      message,
      school: entry.school,
      createdBy: entry.teacher,
    });
  }
}
exports.getAllHomeworks = async (req, res) => {
  try {
    const filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { teacher: req.user.id } : {},
    );

    if (!filter) {
      return res.status(400).json({
        message: "برجاء تحديد مدرسة (?school=id) لعرض الواجبات.",
      });
    }

    if (req.query.gradeId) {
      const classrooms = await Classroom.find({
        grade: req.query.gradeId,
      }).select("_id");
      const classroomIds = classrooms.map((c) => c._id);
      filter.classroom = { $in: classroomIds };
    }

    const homeworks = await Homework.find(filter)
      .populate("classroom", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: homeworks,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentHomeworks = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });
    if (
      req.user.role === "parent" &&
      student.parent.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({
          message: "غير مصرح لك بعرض واجبات هذا الطالب",
        });
    }
    const homeworks = await Homework.find({ classroom: student.classroom })
      .populate("subject", "name")
      .populate("teacher", "firstName lastName")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: homeworks.length,
      data: homeworks,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateHomework = async (req, res) => {
  try {
    const homeworkId = req.params.id;
    const homework = await Homework.findById(homeworkId);

    if (!homework) {
      return res.status(404).json({ message: "الواجب غير موجود" });
    }

    if (homework.teacher.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بتعديل هذا الواجب" });
    }

    const updatedHomework = await Homework.findByIdAndUpdate(
      homeworkId,
      req.body,
      { new: true, runValidators: true },
    )
      .populate("subject", "name")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      });

    res.status(200).json({
      success: true,
      message: "تم تحديث الواجب بنجاح",
      data: updatedHomework,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteHomework = async (req, res) => {
  try {
    const homeworkId = req.params.id;
    const homework = await Homework.findById(homeworkId);

    if (!homework) {
      return res.status(404).json({ message: "الواجب غير موجود" });
    }

    if (
      homework.teacher.toString() !== req.user.id &&
      !(req.user.role === "admin" && sameSchool(req, homework))
    ) {
      return res
        .status(403)
        .json({ message: "غير مصرح لك بحذف هذا الواجب" });
    }

    await homework.deleteOne();

    res.status(200).json({
      success: true,
      message: "تم حذف الواجب بنجاح",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
