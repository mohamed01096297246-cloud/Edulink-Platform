const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const Result = require("../models/Result");
const MonthlyGrade = require("../models/MonthlyGrade");
const Attendance = require("../models/Attendance");
const Behavior = require("../models/Behavior");
const Notification = require("../models/Notification");
const School = require("../models/School");

// Everything a student may read about themselves. Four screens, no more:
// what's on today, the week's timetable, their homework, their marks. The
// parent's analytics report, the fees, and every other child's data are
// deliberately out of reach — a student account answers "what do I have to
// do, and how am I doing", nothing else.
//
// Two rules are enforced here rather than left to the client:
//   * a student only ever reads their OWN record — the id comes off the
//     token's account, never from the request;
//   * only positive behaviour notes are visible. Negative notes go to the
//     parent alone, so that teachers keep writing them honestly.

const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const schoolTimezone = async (schoolId) => {
  if (!schoolId) return "Africa/Cairo";
  const school = await School.findById(schoolId).select("timezone");
  return school?.timezone || "Africa/Cairo";
};

// The school's own calendar day, not the server's: lessons are timetabled
// against the school's weekday, and the server runs in UTC.
const schoolToday = (timeZone, now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  })
    .formatToParts(now)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  const startOfDay = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  return {
    day: DAY_CODES[new Date(startOfDay).getUTCDay()],
    startOfDay,
    endOfDay: new Date(startOfDay.getTime() + 24 * 3600 * 1000),
  };
};

// The caller's own student record. A student account always points at one
// (studentAccountController creates them together), so a missing record
// means the student was deleted from the school while logged in.
const myStudent = async (req) =>
  Student.findOne({ _id: req.user.studentProfile, school: req.user.school })
    .populate("classroom", "name")
    .populate("grade", "name stage");

const notFound = (res) =>
  res.status(404).json({
    success: false,
    message: "لم نجد بيانات الطالب المرتبطة بهذا الحساب. تواصل مع إدارة المدرسة.",
  });

const lessonShape = (lesson) => ({
  _id: lesson._id,
  subject: lesson.subject?.name || "",
  teacher: lesson.teacher
    ? `${lesson.teacher.firstName} ${lesson.teacher.lastName}`
    : "",
  period: lesson.period,
  startTime: lesson.startTime,
  endTime: lesson.endTime,
  day: lesson.day,
});

const byPeriod = (a, b) =>
  (a.period || 99) - (b.period || 99) || String(a.startTime).localeCompare(String(b.startTime));

// The home screen: today's lessons, what's due, and the two lines that
// answer "anything I should know?" — absences so far and the school's
// latest announcement.
exports.getToday = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);

    const timeZone = await schoolTimezone(student.school);
    const { day, startOfDay } = schoolToday(timeZone);

    const [lessons, homework, attendance, praise, announcement] = await Promise.all([
      student.classroom
        ? Schedule.find({ classroom: student.classroom._id, day })
            .populate("subject", "name")
            .populate("teacher", "firstName lastName")
        : [],
      student.classroom
        ? Homework.find({
            classroom: student.classroom._id,
            dueDate: { $gte: startOfDay },
          })
            .populate("subject", "name")
            .sort({ dueDate: 1 })
            .limit(5)
        : [],
      Attendance.find({ student: student._id, ...Attendance.GRADED_ONLY }).select("status"),
      Behavior.find({ student: student._id, type: "positive" })
        .populate("subject", "name")
        .sort({ date: -1 })
        .limit(3),
      Notification.findOne({
        school: student.school,
        target: "all",
        $or: [{ stages: { $size: 0 } }, { stages: student.grade?.stage }],
      }).sort({ createdAt: -1 }),
    ]);

    const submitted = await HomeworkResult.find({
      student: student._id,
      homework: { $in: homework.map((h) => h._id) },
    }).select("homework status");
    const resultOf = new Map(submitted.map((r) => [String(r.homework), r.status]));

    res.status(200).json({
      success: true,
      data: {
        student: {
          fullName: `${student.firstName} ${student.lastName}`,
          classroom: student.classroom?.name || "",
          grade: student.grade?.name || "",
        },
        today: { day },
        lessons: lessons.sort(byPeriod).map(lessonShape),
        homework: homework.map((h) => ({
          _id: h._id,
          title: h.title,
          subject: h.subject?.name || "",
          pageNumber: h.pageNumber,
          dueDate: h.dueDate,
          status: resultOf.get(String(h._id)) || null,
        })),
        attendance: {
          present: attendance.filter((a) => a.status === "present").length,
          absent: attendance.filter((a) => a.status === "absent").length,
          late: attendance.filter((a) => a.status === "late").length,
        },
        praise: praise.map((b) => ({
          _id: b._id,
          note: b.note,
          subject: b.subject?.name || "",
          date: b.date,
        })),
        announcement: announcement
          ? {
              title: announcement.title,
              message: announcement.message,
              createdAt: announcement.createdAt,
            }
          : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The week's timetable, grouped by day in school-week order.
exports.getSchedule = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);
    if (!student.classroom) {
      return res.status(200).json({ success: true, data: { days: [], classroom: null } });
    }

    const lessons = await Schedule.find({ classroom: student.classroom._id })
      .populate("subject", "name")
      .populate("teacher", "firstName lastName");

    const week = ["sat", "sun", "mon", "tue", "wed", "thu"];
    res.status(200).json({
      success: true,
      data: {
        classroom: student.classroom.name,
        days: week.map((day) => ({
          day,
          lessons: lessons.filter((l) => l.day === day).sort(byPeriod).map(lessonShape),
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Homework set for this student's classroom, newest first, each carrying
// whatever the teacher has recorded for this student.
exports.getHomework = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);
    if (!student.classroom) {
      return res.status(200).json({ success: true, data: [] });
    }

    const homework = await Homework.find({ classroom: student.classroom._id })
      .populate("subject", "name")
      .sort({ dueDate: -1 })
      .limit(60);

    const results = await HomeworkResult.find({
      student: student._id,
      homework: { $in: homework.map((h) => h._id) },
    }).select("homework status score teacherFeedback");
    const resultOf = new Map(results.map((r) => [String(r.homework), r]));

    res.status(200).json({
      success: true,
      data: homework.map((h) => {
        const mine = resultOf.get(String(h._id));
        return {
          _id: h._id,
          title: h.title,
          subject: h.subject?.name || "",
          pageNumber: h.pageNumber,
          totalMarks: h.totalMarks,
          dueDate: h.dueDate,
          status: mine?.status || null,
          score: mine?.score ?? null,
          teacherFeedback: mine?.teacherFeedback || "",
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Exam marks and monthly-test marks — the student's own, and only their own.
exports.getGrades = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);

    const [exams, monthly] = await Promise.all([
      Result.find({ student: student._id })
        .populate("exam", "title examType academicYear")
        .populate("subject", "name")
        .sort({ createdAt: -1 }),
      MonthlyGrade.find({ student: student._id })
        .populate("subject", "name")
        .sort({ year: -1, month: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        exams: exams.map((r) => ({
          _id: r._id,
          exam: r.exam?.title || "",
          examType: r.exam?.examType || "",
          subject: r.subject?.name || "",
          grade: r.grade,
        })),
        // Monthly checks are out of 15, not 100 (see the MonthlyGrade
        // model) — sent along so the screen never has to assume.
        monthly: monthly.map((m) => ({
          _id: m._id,
          subject: m.subject?.name || "",
          month: m.month,
          year: m.year,
          grade: m.grade,
          outOf: 15,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
