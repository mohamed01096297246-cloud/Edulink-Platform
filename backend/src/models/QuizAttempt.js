const mongoose = require("mongoose");

// One student's go at a Quiz: the choice picked for each question (null for
// one left blank), marked by the server when it is sent. One per student per
// quiz — the review shows the right answers, so a second go would be no test.
const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    // Parallel to quiz.questions: the picked choice's index, or null.
    answers: [{ type: Number, default: null }],
    // The question ids the answers were given against, so a later edit of
    // the quiz can't shift one answer onto another question.
    questionIds: [{ type: mongoose.Schema.Types.ObjectId }],
    // In points (Quiz question `points`), not questions.
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0.5 },
    // Seconds from opening the quiz to sending it, as the app reports it.
    seconds: { type: Number, min: 0 },
  },
  { timestamps: true },
);

quizAttemptSchema.index({ quiz: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
