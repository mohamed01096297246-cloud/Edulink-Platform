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
const { studentPerformance } = require("../utils/studentPerformance");
const { testMarksOf } = require("../utils/testMarks");
const { asTakenBy, otherLanguagesFor } = require("../utils/secondLanguage");
const { monthsBegun, schoolMonth } = require("../utils/schoolMonths");
const { buildMonthlyReport, testsWaiting } = require("../utils/monthlyReport");
const { writeMonthlyReportPdf } = require("../utils/monthlyReportPdf");
const { signLink, downloadName } = require("../utils/downloadLink");

// Everything a student may read about themselves: what's on today, the
// week's timetable, their homework, their marks, and «تقريري الشهري». The
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
    .populate("classroom", "name grade school academicYear")
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

// Attendance by the day, not the lesson (Mohamed, 2026-10-31), as the
// parent's الحضور reads it: a day with any lesson missed is a day absent.
// An excused absence isn't held against the student, as in the register's
// «عدد أيام الغياب» — such a day is neither. Records are dated at midnight
// UTC, so the date part is the school day itself.
const attendanceDays = (records) => {
  const days = new Map();
  records.forEach((r) => {
    const date = new Date(r.date);
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(r);
  });
  let present = 0;
  let absent = 0;
  days.forEach((lessons) => {
    const missed = lessons.filter((r) => r.status === "absent");
    if (missed.length === 0) present += 1;
    else if (missed.some((r) => !r.excused)) absent += 1;
  });
  return { present, absent };
};

// The home screen: today's lessons, what's due, and the two lines that
// answer "anything I should know?" — absences so far and the school's
// latest announcement.
exports.getToday = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);

    const timeZone = await schoolTimezone(student.school);
    const { day, startOfDay } = schoolToday(timeZone);
    const otherLanguages = await otherLanguagesFor(student);

    const [lessons, homework, attendance, praise, announcement, unreadNotifications] = await Promise.all([
      student.classroom
        ? Schedule.find({ classroom: student.classroom._id, day })
            .populate("subject", "name")
            .populate("teacher", "firstName lastName")
        : [],
      student.classroom
        ? Homework.find({
            classroom: student.classroom._id,
            dueDate: { $gte: startOfDay },
            ...(otherLanguages.length ? { subject: { $nin: otherLanguages } } : {}),
          })
            .populate("subject", "name")
            .sort({ dueDate: 1 })
            .limit(5)
        : [],
      Attendance.find({ student: student._id, ...Attendance.GRADED_ONLY }).select("status excused date"),
      Behavior.find({ student: student._id, type: "positive" })
        .populate("subject", "name")
        .sort({ date: -1 })
        .limit(3),
      Notification.findOne({
        school: student.school,
        target: "all",
        $and: [
          { $or: [{ stages: { $exists: false } }, { stages: { $size: 0 } }, { stages: student.grade?.stage }] },
          // A teacher's notice to certain classes reaches only those classes.
          {
            $or: [
              { classrooms: { $exists: false } },
              { classrooms: { $size: 0 } },
              ...(student.classroom ? [{ classrooms: student.classroom._id }] : []),
            ],
          },
        ],
      }).sort({ createdAt: -1 }),
      // The bell's count: notices this student hasn't opened yet.
      Notification.countDocuments({ ...noticesFor(student, req.user._id), readBy: { $ne: req.user._id } }),
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
        lessons: asTakenBy(lessons, student).sort(byPeriod).map(lessonShape),
        homework: homework.map((h) => ({
          _id: h._id,
          title: h.title,
          subject: h.subject?.name || "",
          pageNumber: h.pageNumber,
          dueDate: h.dueDate,
          status: resultOf.get(String(h._id)) || null,
        })),
        attendance: {
          // Lessons, for apps from before `days`.
          present: attendance.filter((a) => a.status === "present").length,
          absent: attendance.filter((a) => a.status === "absent").length,
          late: attendance.filter((a) => a.status === "late").length,
          days: attendanceDays(attendance),
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
        unreadNotifications,
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

    const lessons = asTakenBy(
      await Schedule.find({ classroom: student.classroom._id })
        .populate("subject", "name")
        .populate("teacher", "firstName lastName"),
      student,
    );

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

    const otherLanguages = await otherLanguagesFor(student);
    const homework = await Homework.find({
      classroom: student.classroom._id,
      ...(otherLanguages.length ? { subject: { $nin: otherLanguages } } : {}),
    })
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

// "أدائي": the student's standing in every subject over a term — weeks,
// month averages, tests, أعمال السنة, homework and attendance
// (utils/studentPerformance.js). ?term=1|2, the current term by default.
exports.getPerformance = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);
    if (!student.classroom) {
      return res.status(200).json({ success: true, data: { subjects: [] } });
    }

    const timeZone = await schoolTimezone(student.school);
    const { startOfDay } = schoolToday(timeZone);
    const data = await studentPerformance({ student, term: req.query.term, today: startOfDay });

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Exam marks and test marks — the student's own, and only their own.
// `tests` is what the parent's الدرجات shows (utils/testMarks.js): the
// monthly test month by month, or on weekly40 the term's two tests, which
// `monthly` never had. `monthly` stays for apps from before it.
exports.getGrades = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);

    const [exams, monthly, tests] = await Promise.all([
      Result.find({ student: student._id })
        .populate("exam", "title examType academicYear")
        .populate("subject", "name")
        .sort({ createdAt: -1 }),
      MonthlyGrade.find({ student: student._id })
        .populate("subject", "name")
        .sort({ year: -1, month: -1 }),
      testMarksOf(student),
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
          // «غ» / «م» (utils/absentMark.js).
          absent: Boolean(m.absent) && Number(m.grade) === 0,
          withdrawn: Boolean(m.withdrawn) && Number(m.grade) === 0,
        })),
        tests,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The notices a student may read: those addressed to them (a teacher's
// action, utils/notify.js) and the school's announcements reaching their
// stage and class — the same rule as the home screen's latest announcement.
const noticesFor = (student, userId) => ({
  school: student.school,
  $or: [
    { target: "student", user: userId },
    {
      target: "all",
      $and: [
        { $or: [{ stages: { $exists: false } }, { stages: { $size: 0 } }, { stages: student.grade?.stage }] },
        {
          $or: [
            { classrooms: { $exists: false } },
            { classrooms: { $size: 0 } },
            ...(student.classroom ? [{ classrooms: student.classroom._id }] : []),
          ],
        },
      ],
    },
  ],
});

// الإشعارات: everything sent to this student, newest first, each saying who
// sent it — a teacher by name, otherwise the school's administration.
exports.getNotifications = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);

    const notices = await Notification.find(noticesFor(student, req.user._id))
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("createdBy", "firstName lastName role")
      .lean();

    const me = String(req.user._id);
    res.status(200).json({
      success: true,
      data: notices.map((n) => ({
        _id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        target: n.target,
        createdAt: n.createdAt,
        read: (n.readBy || []).some((id) => String(id) === me),
        from:
          n.createdBy?.role === "teacher"
            ? `أ. ${n.createdBy.firstName} ${n.createdBy.lastName}`
            : "إدارة المدرسة",
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// «تقريري الشهري» (utils/monthlyReport.js): the school months begun, newest
// first, `complete` once over (the app marks the others «لسه ماخلصش»). In a
// school with School.features.reportAfterTest a month's report opens only
// once the month is over and its test is entered in every subject
// (testsWaiting) — printed before, it passed for the month's result with the
// test missing; `waiting` names the subjects whose test isn't in.
const reportAfterTest = async (student) =>
  Boolean((await School.findById(student.school).select("features").lean())?.features?.reportAfterTest);

exports.getMonthlyReports = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);
    const { startOfDay } = schoolToday(await schoolTimezone(student.school));
    const gated = await reportAfterTest(student);
    const months = await Promise.all(
      monthsBegun(startOfDay).map(async (m) => {
        const over = startOfDay > m.to;
        const waiting = over && gated ? await testsWaiting({ studentId: student._id, monthNumber: m.month }) : [];
        return {
          month: m.month,
          label: m.label,
          from: m.from.toISOString().slice(0, 10),
          to: m.to.toISOString().slice(0, 10),
          complete: over && !waiting.length,
          waiting,
        };
      }),
    );
    res.status(200).json({ success: true, data: { months: months.reverse() } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const reportMonth = (value, today) => {
  const month = schoolMonth(Number(value));
  return month && month.from <= today ? month : null;
};

// Why a begun month's report isn't open yet, or null when it is — always
// open where the school doesn't hold reports for the test.
const notOpenYet = async (student, month, today) => {
  if (!(await reportAfterTest(student))) return null;
  if (today <= month.to) return `تقرير ${month.label} هيفتح لما الشهر يخلص ويترصد اختباره.`;
  const waiting = await testsWaiting({ studentId: student._id, monthNumber: month.month });
  if (!waiting.length) return null;
  return `تقرير ${month.label} هيفتح لما اختبار الشهر يترصد في: ${waiting.join("، ")}.`;
};

// A link the phone's browser downloads the report from (utils/downloadLink),
// signed for this student and this month only.
exports.monthlyReportLink = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);
    const { startOfDay } = schoolToday(await schoolTimezone(student.school));
    const month = reportMonth(req.query.month, startOfDay);
    if (!month) return res.status(400).json({ success: false, message: "اختار الشهر." });
    const why = await notOpenYet(student, month, startOfDay);
    if (why) return res.status(409).json({ success: false, message: why });
    const query = { month: String(req.query.month), name: String(req.query.name || "") };
    const dl = signLink(req.user._id, "/monthly-report", query);
    res.json({ success: true, url: `/student/monthly-report?${new URLSearchParams({ ...query, dl })}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The report itself, as a PDF: ?month=n (a school month), ?name= the file
// name the phone saves it under.
exports.getMonthlyReport = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student) return notFound(res);
    const { startOfDay } = schoolToday(await schoolTimezone(student.school));
    const month = reportMonth(req.query.month, startOfDay);
    if (!month) return res.status(400).json({ success: false, message: "اختار الشهر." });
    const why = await notOpenYet(student, month, startOfDay);
    if (why) return res.status(409).json({ success: false, message: why });

    const report = await buildMonthlyReport({ studentId: student._id, monthNumber: month.month });
    if (!report || !report.subjects.length) {
      return res.status(404).json({
        success: false,
        message: `لسه مفيش درجات متسجّلة في ${month.label}، فمفيش تقرير له.`,
      });
    }

    const name = downloadName(req.query.name, ".pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="monthly-report-${month.month}.pdf"` +
        (name ? `; filename*=UTF-8''${encodeURIComponent(name)}` : ""),
    );
    await new Promise((resolve, reject) => {
      res.on("finish", resolve);
      res.on("error", reject);
      writeMonthlyReportPdf(report, res);
    });
    return undefined;
  } catch (err) {
    if (res.headersSent) return res.end();
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Opening the notifications screen settles what is on it, as the parent's
// does — only notices this student may read in the first place.
exports.markNotificationsRead = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "لا يوجد إشعارات لتحديدها كمقروءة." });
    }

    const student = await myStudent(req);
    if (!student) return notFound(res);

    await Notification.updateMany(
      { _id: { $in: ids }, ...noticesFor(student, req.user._id) },
      { $addToSet: { readBy: req.user._id } },
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
