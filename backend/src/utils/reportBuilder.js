const Attendance = require("../models/Attendance");
const Behavior = require("../models/Behavior");
const HomeworkResult = require("../models/HomeworkResult");
const Result = require("../models/Result");

// Rolling windows, not calendar day/week/month — a parent opening this on
// any given day always sees "the last N days", never a half-empty bucket
// because it's the 2nd of the month or a Monday morning.
const PERIOD_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const getRange = (period) => {
  const days = PERIOD_DAYS[period] || PERIOD_DAYS.weekly;

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return { start, end };
};

const round1 = (value) => Math.round(value * 10) / 10;

const buildAttendanceSummary = async (studentId, start, end) => {
  const records = await Attendance.find({
    student: studentId,
    date: { $gte: start, $lte: end },
  });

  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const total = records.length;

  return {
    total,
    present,
    absent,
    late,
    rate: total > 0 ? round1((present / total) * 100) : null,
  };
};

const buildBehaviorSummary = async (studentId, start, end) => {
  const records = await Behavior.find({
    student: studentId,
    date: { $gte: start, $lte: end },
  })
    .populate("subject", "name")
    .sort({ date: -1 });

  const positive = records.filter((r) => r.type === "positive").length;
  const negative = records.filter((r) => r.type === "negative").length;

  const recent = records.slice(0, 5).map((r) => ({
    type: r.type,
    note: r.note,
    date: r.date,
    subject: r.subject?.name || null,
  }));

  return { total: records.length, positive, negative, recent };
};

const buildHomeworkSummary = async (studentId, start, end) => {
  const results = await HomeworkResult.find({
    student: studentId,
    createdAt: { $gte: start, $lte: end },
  }).populate("homework", "title totalMarks");

  const submitted = results.filter((r) => r.status === "submitted").length;
  const missing = results.filter((r) => r.status === "missing").length;

  const scored = results.filter(
    (r) => r.status === "submitted" && r.homework?.totalMarks > 0
  );

  const avgScorePercent =
    scored.length > 0
      ? round1(
          (scored.reduce(
            (sum, r) => sum + (r.score || 0) / r.homework.totalMarks,
            0
          ) /
            scored.length) *
            100
        )
      : null;

  return { total: results.length, submitted, missing, avgScorePercent };
};

const buildExamSummary = async (studentId, start, end) => {
  const results = await Result.find({
    student: studentId,
    createdAt: { $gte: start, $lte: end },
  })
    .populate("subject", "name")
    .populate("exam", "title")
    .sort({ createdAt: -1 });

  const avgGrade =
    results.length > 0
      ? round1(results.reduce((sum, r) => sum + r.grade, 0) / results.length)
      : null;

  const recent = results.slice(0, 5).map((r) => ({
    subject: r.subject?.name || null,
    examTitle: r.exam?.title || null,
    grade: r.grade,
  }));

  return { total: results.length, avgGrade, recent };
};

// Deterministic status classification — no AI, just clear thresholds a
// parent can trust and a teacher/admin could audit.
const classifyStatus = ({ attendance, behavior, homework, exams }) => {
  const alerts = [
    attendance.rate !== null && attendance.rate < 60,
    exams.avgGrade !== null && exams.avgGrade < 50,
    behavior.negative >= 5,
    homework.total > 0 && homework.missing / homework.total > 0.5,
  ];

  const warnings = [
    attendance.rate !== null && attendance.rate < 85,
    exams.avgGrade !== null && exams.avgGrade < 65,
    behavior.negative > behavior.positive && behavior.negative >= 2,
    homework.total > 0 && homework.missing / homework.total > 0.25,
  ];

  if (alerts.some(Boolean)) return "alert";
  if (warnings.some(Boolean)) return "needs_attention";
  return "good";
};

// Every aspect is normalised onto the same 0-100 scale so they can be
// compared with each other and averaged into one overall level. An aspect
// with no records at all returns null and is skipped entirely rather than
// counted as a zero — a child with no exams yet isn't "failing exams".
const scoreAttendance = (attendance) => attendance.rate;

const scoreHomework = (homework) => {
  if (homework.total === 0) return null;

  const submissionRate = (homework.submitted / homework.total) * 100;

  // Handing work in and doing it well are both half the picture; when
  // nothing is graded yet, submission alone carries the score.
  if (homework.avgScorePercent === null) return round1(submissionRate);

  return round1(submissionRate * 0.5 + homework.avgScorePercent * 0.5);
};

const scoreExams = (exams) => exams.avgGrade;

// Behaviour has no natural percentage, so it starts from a neutral baseline
// and moves either way. A negative note weighs heavier than a positive one
// because that asymmetry is what a parent actually needs surfaced.
const scoreBehavior = (behavior) => {
  if (behavior.total === 0) return null;

  const raw = 80 + behavior.positive * 5 - behavior.negative * 15;

  return Math.max(0, Math.min(100, raw));
};

const OVERALL_LEVELS = [
  { key: "excellent", min: 85 },
  { key: "very_good", min: 70 },
  { key: "good", min: 55 },
  { key: "needs_follow_up", min: 0 },
];

const ASPECT_LEVELS = [
  { key: "excellent", min: 85 },
  { key: "good", min: 65 },
  { key: "needs_improvement", min: 0 },
];

const levelFor = (scale, score) =>
  scale.find((level) => score >= level.min).key;

// The parent-facing headline: one level for the whole picture, plus the
// same judgement broken down per aspect so "needs follow-up" always comes
// with "…on what". Aspect keys (not Arabic labels) cross the wire — the
// app already names these four things in its own UI.
const buildProgress = ({ attendance, behavior, homework, exams }) => {
  const aspects = [
    { key: "attendance", score: scoreAttendance(attendance) },
    { key: "homework", score: scoreHomework(homework) },
    { key: "exams", score: scoreExams(exams) },
    { key: "behavior", score: scoreBehavior(behavior) },
  ]
    .filter((aspect) => aspect.score !== null)
    .map((aspect) => ({
      ...aspect,
      score: round1(aspect.score),
      level: levelFor(ASPECT_LEVELS, aspect.score),
    }));

  if (aspects.length === 0) {
    return { overallScore: null, overallLevel: null, aspects: [] };
  }

  const overallScore = round1(
    aspects.reduce((sum, aspect) => sum + aspect.score, 0) / aspects.length,
  );

  return {
    overallScore,
    overallLevel: levelFor(OVERALL_LEVELS, overallScore),
    aspects,
  };
};

// Template-based guidance — condition -> pre-written tip. Deliberately not
// AI-generated: instant, free, and every message here was reviewed rather
// than produced on the fly.
const buildTips = ({ attendance, behavior, homework, exams }) => {
  const tips = [];

  if (attendance.rate !== null && attendance.rate < 60) {
    tips.push({
      type: "alert",
      message:
        "نسبة الحضور منخفضة جدًا في هذه الفترة. برجاء التواصل مع المدرسة لمعرفة سبب غياب ابنك/ابنتك المتكرر.",
    });
  } else if (attendance.rate !== null && attendance.rate < 85) {
    tips.push({
      type: "warning",
      message:
        "نسبة الحضور تراجعت شوية في هذه الفترة. حديث بسيط عن أهمية الحضور اليومي ممكن يساعد في تحسين الموضوع.",
    });
  }

  if (attendance.late >= 3) {
    tips.push({
      type: "warning",
      message:
        "فيه تأخيرات متكررة في هذه الفترة. تعديل روتين الصباح بـ10-15 دقيقة ممكن يعمل فرق حقيقي.",
    });
  }

  if (behavior.negative >= 5) {
    tips.push({
      type: "alert",
      message:
        "تم تسجيل ملاحظات سلوكية سلبية متعددة في هذه الفترة. يفضل التواصل مع المعلم مباشرة لفهم الموقف بالتفصيل.",
    });
  } else if (behavior.negative > behavior.positive && behavior.negative >= 2) {
    tips.push({
      type: "warning",
      message:
        "عدد الملاحظات السلوكية السلبية أكتر من الإيجابية في هذه الفترة. حديث هادئ في البيت عن قواعد الفصل ممكن يساعد.",
    });
  } else if (behavior.positive >= 3 && behavior.negative === 0) {
    tips.push({
      type: "success",
      message:
        "سلوك إيجابي مستمر طول هذه الفترة — فرصة كويسة إنك تشجّع ابنك/ابنتك على ده في البيت.",
    });
  }

  if (homework.total > 0 && homework.missing / homework.total > 0.5) {
    tips.push({
      type: "alert",
      message:
        "أكتر من نص واجبات هذه الفترة متأخرة. تحديد ميعاد ثابت لأداء الواجب كل يوم ممكن يساعد في بناء العادة دي.",
    });
  } else if (homework.total > 0 && homework.missing / homework.total > 0.25) {
    tips.push({
      type: "warning",
      message:
        "نسبة ملحوظة من الواجبات ماتسلمتش في هذه الفترة. المتابعة قبل النوم على واجب بكرة ممكن يساعد.",
    });
  } else if (homework.total > 0 && homework.missing === 0) {
    tips.push({
      type: "success",
      message: "كل الواجبات اتسلمت في هذه الفترة — أحسنت.",
    });
  }

  if (exams.avgGrade !== null && exams.avgGrade < 50) {
    tips.push({
      type: "alert",
      message:
        "درجات الامتحانات في هذه الفترة أقل من المتوسط بكتير. يفضل تسأل المعلم عن دعم إضافي أو خطة مذاكرة.",
    });
  } else if (exams.avgGrade !== null && exams.avgGrade < 65) {
    tips.push({
      type: "warning",
      message:
        "درجات الامتحانات بتقول إن فيه مواد محتاجة وقت مراجعة إضافي. عادة مراجعة يومية بسيطة ممكن تقفل الفجوة.",
    });
  } else if (exams.avgGrade !== null && exams.avgGrade >= 85) {
    tips.push({
      type: "success",
      message: "أداء قوي في الامتحانات في هذه الفترة — استمر على نفس روتين المذاكرة.",
    });
  }

  if (tips.length === 0) {
    tips.push({
      type: "info",
      message:
        "مفيش تغييرات ملحوظة في هذه الفترة. كل حاجة مستقرة — استمر على نفس الروتين الحالي.",
    });
  }

  return tips;
};

exports.buildStudentReport = async (studentId, period) => {
  const { start, end } = getRange(period);

  const [attendance, behavior, homework, exams] = await Promise.all([
    buildAttendanceSummary(studentId, start, end),
    buildBehaviorSummary(studentId, start, end),
    buildHomeworkSummary(studentId, start, end),
    buildExamSummary(studentId, start, end),
  ]);

  const status = classifyStatus({ attendance, behavior, homework, exams });
  const progress = buildProgress({ attendance, behavior, homework, exams });
  const tips = buildTips({ attendance, behavior, homework, exams });

  return {
    period,
    range: { start, end },
    // `status` predates `progress` and stays in the payload so an older
    // installed app build keeps working against this deployment.
    status,
    progress,
    attendance,
    behavior,
    homework,
    exams,
    tips,
  };
};
