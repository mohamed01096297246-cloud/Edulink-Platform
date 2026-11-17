const mongoose = require("mongoose");
const Student = require("../models/Student");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");

// «الامتحانات الإلكترونية» in the student app (models/Quiz.js). A student
// sees the published quizzes of their own classroom, takes one once, and is
// marked the moment they send it: the score, every question with what they
// picked and the right answer, and for each one they got wrong the
// explanation. The right answers are never sent before that.

const myStudent = async (req) =>
  Student.findOne({ _id: req.user.studentProfile, school: req.user.school }).select("classroom school");

const notFound = (res, message = "الامتحان ده مش موجود.") => res.status(404).json({ success: false, message });

// The quizzes a student may see: their classroom's, published, opened.
const visibleTo = (student, now = new Date()) => ({
  school: student.school,
  classrooms: student.classroom,
  published: true,
  $or: [{ opensAt: null }, { opensAt: { $exists: false } }, { opensAt: { $lte: now } }],
});

const isClosed = (quiz, now = new Date()) => Boolean(quiz.closesAt && quiz.closesAt < now);

const pointsOf = (q) => q.points || 1;
const fullMark = (quiz) => quiz.questions.reduce((n, q) => n + pointsOf(q), 0);

const quizHead = (quiz) => ({
  id: quiz._id,
  title: quiz.title,
  subjectName: quiz.subjectName,
  scope: quiz.scope,
  direction: quiz.direction || "rtl",
  questionCount: quiz.questions.length,
  fullMark: fullMark(quiz),
  closesAt: quiz.closesAt || null,
});

const passagesOf = (quiz) =>
  (quiz.passages || []).map((p) => ({
    key: p.key,
    kind: p.kind,
    title: p.title,
    text: p.text,
    image: p.image || null,
    audio: p.audio || null,
  }));

// A question as it is put to the student: no answer, no explanation.
const askedShape = (q) => ({
  id: q._id,
  type: q.type,
  section: q.section,
  passage: q.passage || null,
  points: pointsOf(q),
  image: q.image || null,
  text: q.text,
  choices: q.choices,
});

// The marked attempt as the student reads it: score, the score of each part
// of the unit, and every question with the pick, the right answer and why.
const reviewOf = (quiz, attempt) => {
  const picked = new Map(attempt.questionIds.map((id, i) => [String(id), attempt.answers[i]]));
  const sections = new Map();
  const questions = quiz.questions.map((q) => {
    const chosen = picked.has(String(q._id)) ? picked.get(String(q._id)) : null;
    const correct = chosen === q.answer;
    const key = q.section || "";
    const s = sections.get(key) || { section: key, score: 0, total: 0 };
    s.total += pointsOf(q);
    if (correct) s.score += pointsOf(q);
    sections.set(key, s);
    return {
      ...askedShape(q),
      answer: q.answer,
      chosen: chosen === undefined ? null : chosen,
      correct,
      explanation: q.explanation,
    };
  });
  return {
    quiz: quizHead(quiz),
    passages: passagesOf(quiz),
    score: attempt.score,
    total: attempt.total,
    percent: Math.round((attempt.score / attempt.total) * 100),
    submittedAt: attempt.createdAt,
    seconds: attempt.seconds ?? null,
    sections: [...sections.values()],
    questions,
  };
};

// GET /student/quizzes — newest first, each with the student's result when
// they have taken it.
exports.listQuizzes = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student || !student.classroom) return res.status(200).json({ success: true, data: { quizzes: [] } });
    const now = new Date();
    const quizzes = await Quiz.find(visibleTo(student, now)).sort({ createdAt: -1 }).lean();
    const attempts = await QuizAttempt.find({ student: student._id, quiz: { $in: quizzes.map((q) => q._id) } })
      .select("quiz score total createdAt")
      .lean();
    const byQuiz = new Map(attempts.map((a) => [String(a.quiz), a]));
    res.status(200).json({
      success: true,
      data: {
        quizzes: quizzes.map((q) => {
          const a = byQuiz.get(String(q._id));
          return {
            ...quizHead(q),
            closed: isClosed(q, now),
            result: a
              ? { score: a.score, total: a.total, percent: Math.round((a.score / a.total) * 100), submittedAt: a.createdAt }
              : null,
          };
        }),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const findVisible = async (req, student) => {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Quiz.findOne({ _id: req.params.id, ...visibleTo(student) });
};

// GET /student/quizzes/:id — the questions to answer, without their answers;
// or, once taken, the marked review.
exports.getQuiz = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student || !student.classroom) return notFound(res);
    const quiz = await findVisible(req, student);
    if (!quiz) return notFound(res);

    const attempt = await QuizAttempt.findOne({ quiz: quiz._id, student: student._id });
    if (attempt) return res.status(200).json({ success: true, data: { taken: true, review: reviewOf(quiz, attempt) } });
    if (isClosed(quiz)) {
      return res.status(409).json({ success: false, message: "الامتحان ده انتهى ميعاده." });
    }
    res.status(200).json({
      success: true,
      data: {
        taken: false,
        quiz: {
          ...quizHead(quiz),
          passages: passagesOf(quiz),
          questions: quiz.questions.map(askedShape),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /student/quizzes/:id/submit — { answers: { <questionId>: <choice> },
// seconds }. Marks it, keeps it, and answers with the review. A question
// left out counts as unanswered (wrong). Sent twice, the first one stands.
exports.submitQuiz = async (req, res) => {
  try {
    const student = await myStudent(req);
    if (!student || !student.classroom) return notFound(res);
    const quiz = await findVisible(req, student);
    if (!quiz) return notFound(res);

    const existing = await QuizAttempt.findOne({ quiz: quiz._id, student: student._id });
    if (existing) return res.status(200).json({ success: true, data: { review: reviewOf(quiz, existing) } });
    if (isClosed(quiz)) {
      return res.status(409).json({ success: false, message: "الامتحان ده انتهى ميعاده." });
    }

    const given = req.body && typeof req.body.answers === "object" && req.body.answers ? req.body.answers : {};
    const answers = quiz.questions.map((q) => {
      const v = given[String(q._id)];
      return Number.isInteger(v) && v >= 0 && v < q.choices.length ? v : null;
    });
    const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? pointsOf(q) : 0), 0);
    const seconds = Number(req.body && req.body.seconds);

    let attempt;
    try {
      attempt = await QuizAttempt.create({
        quiz: quiz._id,
        student: student._id,
        school: student.school,
        answers,
        questionIds: quiz.questions.map((q) => q._id),
        score,
        total: fullMark(quiz),
        ...(Number.isFinite(seconds) && seconds >= 0 ? { seconds: Math.round(seconds) } : {}),
      });
    } catch (err) {
      // Two sends at once: the one that got in first is the result.
      if (err.code !== 11000) throw err;
      attempt = await QuizAttempt.findOne({ quiz: quiz._id, student: student._id });
    }
    res.status(201).json({ success: true, data: { review: reviewOf(quiz, attempt) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
