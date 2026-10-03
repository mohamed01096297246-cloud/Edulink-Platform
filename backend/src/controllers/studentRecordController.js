const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Schedule = require("../models/Schedule");
const ClassAssignment = require("../models/ClassAssignment");
const Attendance = require("../models/Attendance");
const WeeklyEvaluation = require("../models/WeeklyEvaluation");
const ClassworkNotebook = require("../models/ClassworkNotebook");
const CourseworkOverride = require("../models/CourseworkOverride");
const Homework = require("../models/Homework");
const HomeworkResult = require("../models/HomeworkResult");
const MonthlyGrade = require("../models/MonthlyGrade");
const TermTest = require("../models/TermTest");
const Result = require("../models/Result");
const Behavior = require("../models/Behavior");
const BoardNote = require("../models/BoardNote");
// Registered for the populates below, not used directly.
require("../models/User");
require("../models/Grade");
require("../models/Classroom");
require("../models/Exam");
const { sameSchool, inStage, STAGE_DENIED } = require("../utils/tenant");
const { SCHEMES, schemeForClassroom } = require("../utils/gradebook");
const { computeWeekScores } = require("../utils/weekScores");
const { isDailyMode } = require("../utils/dailyAttendance");
const { reportPeriod } = require("../utils/reportPeriod");

// A student's whole record for a week or a month, for the school's admins:
// every register they were marked on, every mark each teacher recorded
// (worked out exactly as the register and the parent's «أدائي» work them
// out), every homework set to their class and how they did on it, every
// behaviour note — negative ones included, which the student never sees —
// and every board note their class received. Read only.

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const teacherName = (t) => (t ? `${t.firstName || ""} ${t.lastName || ""}`.trim() : "");

exports.getStudentRecord = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate("grade", "name stage")
      .populate("classroom", "name grade school academicYear")
      .populate("parent", "firstName lastName phoneNumber");

    if (!student || !sameSchool(req, student)) {
      return res.status(404).json({ message: "Student not found" });
    }
    if (!inStage(req, student.grade?._id || student.grade)) {
      return res.status(403).json({ message: STAGE_DENIED });
    }

    const range = reportPeriod(req.query.period, req.query.date);
    const window = { $gte: range.start, $lte: range.end };
    const classroom = student.classroom;
    const classroomId = classroom?._id;
    const scheme = classroom ? await schemeForClassroom(classroom) : "classic";
    const rules = SCHEMES[scheme];
    const daily = await isDailyMode(student.school);

    const months = [];
    for (let d = new Date(range.start); d <= range.end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      months.push({ month: d.getUTCMonth() + 1, year: d.getUTCFullYear() });
    }

    const [attendance, subjects, homework, behavior, boardNotes, monthly, termTests, exams] = await Promise.all([
      Attendance.find({ student: student._id, date: window })
        .populate("subject", "name")
        .populate("recordedBy", "firstName lastName")
        .sort({ date: 1 })
        .lean(),
      Subject.find({ school: student.school, ...Subject.coveringGrade(student.grade?._id || student.grade) })
        .select("name")
        .sort({ name: 1 })
        .lean(),
      classroomId
        ? Homework.find({ classroom: classroomId, createdAt: window })
            .populate("subject", "name")
            .populate("teacher", "firstName lastName")
            .sort({ createdAt: 1 })
            .lean()
        : [],
      Behavior.find({ student: student._id, date: window })
        .populate("subject", "name")
        .populate("teacher", "firstName lastName")
        .sort({ date: 1 })
        .lean(),
      classroomId
        ? BoardNote.find({ classroom: classroomId, createdAt: window })
            .select("caption imageCount subject teacher createdAt")
            .populate("subject", "name")
            .populate("teacher", "firstName lastName")
            .sort({ createdAt: 1 })
            .lean()
        : [],
      MonthlyGrade.find({ student: student._id, $or: months }).populate("subject", "name").lean(),
      TermTest.find({ student: student._id, updatedAt: window }).populate("subject", "name").lean(),
      Result.find({ student: student._id, createdAt: window }).populate("subject", "name").populate("exam", "title").lean(),
    ]);

    // ── Attendance: one row per day on a daily register, per lesson otherwise.
    const graded = attendance.filter((a) => !a.coverSession);
    const absences = graded.filter((a) => a.status === "absent");
    const attendanceSummary = {
      daily,
      records: graded.length,
      present: graded.filter((a) => a.status === "present").length,
      late: graded.filter((a) => a.status === "late").length,
      absent: absences.length,
      excused: absences.filter((a) => a.excused).length,
      absentDays: new Set(absences.filter((a) => !a.excused).map((a) => dayKey(a.date))).size,
      daysRecorded: new Set(graded.map((a) => dayKey(a.date))).size,
      entries: graded
        .filter((a) => a.status !== "present")
        .map((a) => ({
          date: a.date,
          status: a.status,
          excused: Boolean(a.excused),
          subject: a.subject?.name || null,
          recordedBy: teacherName(a.recordedBy),
        })),
    };

    // ── Marks: every subject of the grade, week by week, from the same
    // calculation the printed register uses.
    const teacherOf = new Map();
    if (classroomId) {
      const [assigned, lessons] = await Promise.all([
        ClassAssignment.find({ classroom: classroomId }).populate("teacher", "firstName lastName").lean(),
        Schedule.find({ classroom: classroomId, teacher: { $ne: null } }).populate("teacher", "firstName lastName").lean(),
      ]);
      for (const l of lessons) if (l.subject) teacherOf.set(String(l.subject), teacherName(l.teacher));
      for (const a of assigned) if (a.subject) teacherOf.set(String(a.subject), teacherName(a.teacher));
    }

    const marks = classroomId
      ? await Promise.all(
          subjects.map(async (subject) => {
            const where = { classroom: classroomId, subject: subject._id, weekStart: window };
            const [a, b, c] = await Promise.all([
              WeeklyEvaluation.find(where).distinct("weekStart"),
              CourseworkOverride.find(where).distinct("weekStart"),
              rules.classwork ? ClassworkNotebook.find(where).distinct("weekStart") : [],
            ]);
            const starts = [...new Map([...a, ...b, ...c].map((d) => [new Date(d).getTime(), new Date(d)])).values()].sort(
              (x, y) => x - y,
            );
            const weeks = await Promise.all(
              starts.map(async (weekStart) => {
                const scores = await computeWeekScores(classroomId, subject._id, [student._id], weekStart, scheme);
                const mine = scores[String(student._id)] || {};
                return {
                  weekStart,
                  weeklyEvalScore: mine.weeklyEvalScore ?? null,
                  homeworkScore: mine.homeworkScore ?? null,
                  attendanceScore: mine.attendanceScore ?? null,
                  classworkScore: rules.classwork ? mine.classworkScore ?? null : undefined,
                  total: mine.total ?? null,
                };
              }),
            );
            return {
              subjectId: subject._id,
              subject: subject.name,
              teacher: teacherOf.get(String(subject._id)) || "",
              weeks,
            };
          }),
        )
      : [];

    // ── Homework set to the class, and this student's result on each.
    const results = homework.length
      ? await HomeworkResult.find({ student: student._id, homework: { $in: homework.map((h) => h._id) } }).lean()
      : [];
    const resultOf = new Map(results.map((r) => [String(r.homework), r]));
    const homeworkRows = homework.map((h) => {
      const r = resultOf.get(String(h._id));
      return {
        title: h.title,
        pageNumber: h.pageNumber,
        subject: h.subject?.name || "",
        teacher: teacherName(h.teacher),
        setAt: h.createdAt,
        dueDate: h.dueDate,
        totalMarks: h.totalMarks || null,
        status: r ? r.status : "ungraded",
        score: r?.status === "submitted" && h.totalMarks ? r.score ?? null : null,
        feedback: r?.teacherFeedback || "",
      };
    });

    res.status(200).json({
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        gender: student.gender,
        grade: student.grade?.name || "",
        classroom: classroom?.name || "",
        parent: student.parent
          ? { name: teacherName(student.parent), phone: student.parent.phoneNumber || "" }
          : null,
        active: student.active !== false,
      },
      period: range.period,
      start: range.start,
      end: range.end,
      scheme,
      max: rules.max,
      weekTotal: rules.weekTotal,
      attendance: attendanceSummary,
      marks,
      homework: {
        set: homeworkRows.length,
        submitted: homeworkRows.filter((h) => h.status === "submitted").length,
        missing: homeworkRows.filter((h) => h.status === "missing").length,
        ungraded: homeworkRows.filter((h) => h.status === "ungraded").length,
        rows: homeworkRows,
      },
      behavior: {
        positive: behavior.filter((b) => b.type === "positive").length,
        negative: behavior.filter((b) => b.type === "negative").length,
        neutral: behavior.filter((b) => b.type === "neutral").length,
        rows: behavior.map((b) => ({
          date: b.date,
          type: b.type,
          note: b.note,
          subject: b.subject?.name || "",
          teacher: teacherName(b.teacher),
        })),
      },
      tests: [
        ...monthly.map((m) => ({ kind: "monthly", subject: m.subject?.name || "", label: `شهر ${m.month}`, grade: m.grade, outOf: 15 })),
        ...termTests.map((t) => ({
          kind: "term",
          subject: t.subject?.name || "",
          label: `اختبار ${t.testNo} — الترم ${t.term}`,
          grade: t.grade,
          outOf: rules.termTestMax || 15,
        })),
        ...exams.map((e) => ({ kind: "exam", subject: e.subject?.name || "", label: e.exam?.title || "امتحان", grade: e.grade, outOf: 100 })),
      ],
      boardNotes: boardNotes.map((n) => ({
        date: n.createdAt,
        caption: n.caption || "",
        images: n.imageCount || 1,
        subject: n.subject?.name || "",
        teacher: teacherName(n.teacher),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
