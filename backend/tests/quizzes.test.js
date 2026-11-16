require("./helpers/setup");
const path = require("path");
const f = require("./helpers/factory");
const Quiz = require("../src/models/Quiz");
const QuizAttempt = require("../src/models/QuizAttempt");
const User = require("../src/models/User");

// «الامتحانات الإلكترونية»: a student takes their classroom's quiz once and
// is marked the moment they send it — the score, and every question with
// the right answer and, for the wrong ones, why.

const setUp = async ({ quiz = {} } = {}) => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const other = await f.classroom(g);
  const { student } = await f.student(c);
  const { student: elsewhere } = await f.student(other);
  const account = await f.user("student", s, { studentProfile: student._id });
  const otherAccount = await f.user("student", s, { studentProfile: elsewhere._id });
  const q = await Quiz.create({
    school: s._id,
    title: "امتحان الوحدة الأولى",
    subjectName: "لغة عربية",
    classrooms: [c._id],
    published: true,
    questions: [
      { type: "tf", section: "النحو", text: "جميع الحروف مبنية.", choices: ["صح", "غلط"], answer: 0, explanation: "صح." },
      {
        type: "mcq",
        section: "النحو",
        text: "أي الكلمات معرب؟",
        choices: ["هؤلاء", "الوطن", "الذي"],
        answer: 1,
        explanation: "الوطن معرب.",
      },
      { type: "mcq", section: "الإملاء", text: "الصحيح:", choices: ["ذكرا", "ذكرى"], answer: 1, explanation: "ذكرى." },
    ],
    ...quiz,
  });
  return { s, c, student, account, otherAccount, q };
};

test("the student sees their classroom's quiz without its answers, sends it, and is marked at once", async () => {
  const { account, q } = await setUp();
  const st = await f.signIn(account);

  const list = await st.get("/api/student/quizzes");
  expect(list.status).toBe(200);
  expect(list.body.data.quizzes).toHaveLength(1);
  expect(list.body.data.quizzes[0]).toMatchObject({ title: "امتحان الوحدة الأولى", questionCount: 3, result: null });

  const open = await st.get(`/api/student/quizzes/${q._id}`);
  expect(open.status).toBe(200);
  expect(open.body.data.taken).toBe(false);
  const questions = open.body.data.quiz.questions;
  expect(questions).toHaveLength(3);
  // Nothing that gives the answer away.
  const raw = JSON.stringify(open.body);
  expect(raw).not.toContain("explanation");
  expect(raw).not.toContain('"answer"');

  // Right, wrong, and one left blank.
  const sent = await st.post(`/api/student/quizzes/${q._id}/submit`, {
    answers: { [questions[0].id]: 0, [questions[1].id]: 2 },
    seconds: 95,
  });
  expect(sent.status).toBe(201);
  const review = sent.body.data.review;
  expect(review).toMatchObject({ score: 1, total: 3, percent: 33, seconds: 95 });
  expect(review.questions.map((x) => x.correct)).toEqual([true, false, false]);
  expect(review.questions[1]).toMatchObject({ chosen: 2, answer: 1, explanation: "الوطن معرب." });
  expect(review.questions[2]).toMatchObject({ chosen: null, answer: 1 });
  expect(review.sections).toEqual([
    { section: "النحو", score: 1, total: 2 },
    { section: "الإملاء", score: 0, total: 1 },
  ]);

  // Once only: the same result comes back, and the quiz now opens on it.
  const again = await st.post(`/api/student/quizzes/${q._id}/submit`, { answers: { [questions[1].id]: 1 } });
  expect(again.body.data.review.score).toBe(1);
  expect(await QuizAttempt.countDocuments()).toBe(1);
  const reopened = await st.get(`/api/student/quizzes/${q._id}`);
  expect(reopened.body.data).toMatchObject({ taken: true, review: { score: 1, total: 3 } });
  const listed = await st.get("/api/student/quizzes");
  expect(listed.body.data.quizzes[0].result).toMatchObject({ score: 1, total: 3, percent: 33 });
});

test("another classroom, an unpublished quiz, one not yet open and one closed are kept apart", async () => {
  const { otherAccount, account, q, s, c } = await setUp();
  const other = await f.signIn(otherAccount);
  expect((await other.get("/api/student/quizzes")).body.data.quizzes).toHaveLength(0);
  expect((await other.get(`/api/student/quizzes/${q._id}`)).status).toBe(404);
  expect((await other.post(`/api/student/quizzes/${q._id}/submit`, { answers: {} })).status).toBe(404);

  const base = { school: s._id, subjectName: "لغة عربية", classrooms: [c._id], questions: q.questions.map((x) => x.toObject()) };
  await Quiz.create({ ...base, title: "مسودة", published: false });
  await Quiz.create({ ...base, title: "لسه", published: true, opensAt: new Date(Date.now() + 86400000) });
  const closed = await Quiz.create({ ...base, title: "انتهى", published: true, closesAt: new Date(Date.now() - 1000) });

  const st = await f.signIn(account);
  const titles = (await st.get("/api/student/quizzes")).body.data.quizzes.map((x) => [x.title, x.closed]);
  expect(titles).toEqual(expect.arrayContaining([["امتحان الوحدة الأولى", false], ["انتهى", true]]));
  expect(titles).toHaveLength(2);
  expect((await st.get(`/api/student/quizzes/${closed._id}`)).status).toBe(409);
  expect((await st.post(`/api/student/quizzes/${closed._id}/submit`, { answers: {} })).status).toBe(409);
  expect((await st.get("/api/student/quizzes/not-an-id")).status).toBe(404);
});

test("a question on a passage comes with its text, and points weigh the score", async () => {
  const { account, s, c } = await setUp();
  const q = await Quiz.create({
    school: s._id,
    title: "على نص",
    subjectName: "لغة عربية",
    classrooms: [c._id],
    published: true,
    passages: [{ key: "r1", kind: "reading", title: "نص القراءة", text: "النص الذي يقرؤه الطالب." }],
    questions: [
      { type: "tf", passage: "r1", text: "من النص.", choices: ["صح", "غلط"], answer: 0, points: 2 },
      { type: "tf", text: "من غير نص.", choices: ["صح", "غلط"], answer: 1 },
    ],
  });
  const st = await f.signIn(account);
  const open = (await st.get(`/api/student/quizzes/${q._id}`)).body.data.quiz;
  expect(open.passages).toEqual([
    { key: "r1", kind: "reading", title: "نص القراءة", text: "النص الذي يقرؤه الطالب.", image: null, audio: null },
  ]);
  expect(open.fullMark).toBe(3);
  expect(open.questions.map((x) => [x.passage, x.points])).toEqual([["r1", 2], [null, 1]]);

  const sent = await st.post(`/api/student/quizzes/${q._id}/submit`, { answers: { [open.questions[0].id]: 0 } });
  expect(sent.body.data.review).toMatchObject({ score: 2, total: 3, percent: 67 });
  expect(sent.body.data.review.passages).toHaveLength(1);

  // A question can't name a passage the quiz doesn't have.
  const bad = new Quiz({
    school: s._id,
    title: "خطأ",
    subjectName: "لغة عربية",
    questions: [{ type: "tf", passage: "missing", text: "؟", choices: ["صح", "غلط"], answer: 0 }],
  });
  await expect(bad.validate()).rejects.toThrow();
});

test("only students take quizzes, and the switch turns them off for one student", async () => {
  const { account, s, q } = await setUp();
  const parent = await f.user("parent", s);
  expect((await (await f.signIn(parent)).get("/api/student/quizzes")).status).toBe(403);
  expect((await f.request(f.app).get("/api/student/quizzes")).status).toBe(401);

  await User.updateOne({ _id: account._id }, { $set: { "appFeatures.quizzes": false } });
  const st = await f.signIn(account);
  expect((await st.get("/api/student/quizzes")).status).toBe(403);
  expect((await st.get(`/api/student/quizzes/${q._id}`)).status).toBe(403);
});

test("the unit 1 Arabic quiz file is a valid quiz: every answer one of its choices, every question explained", async () => {
  const spec = require(path.resolve(__dirname, "../scripts/quizzes/arabic-prep2-term1-unit1.json"));
  const s = await f.school();
  const quiz = new Quiz({
    school: s._id,
    title: spec.title,
    subjectName: spec.subjectName,
    passages: spec.passages,
    questions: spec.questions,
  });
  await expect(quiz.validate()).resolves.toBeUndefined();
  expect(spec.questions.length).toBeGreaterThanOrEqual(25);
  // Listening, reading and poetry questions are asked on the text shown.
  spec.questions
    .filter((x) => /الاستماع|القراءة|الشعري/.test(x.section))
    .forEach((x) => expect(x.passage).toBeTruthy());
  spec.questions.forEach((x) => {
    expect(x.explanation.length).toBeGreaterThan(5);
    if (x.type === "tf") expect(x.choices).toEqual(["صح", "غلط"]);
  });
  // The right answer isn't always in the same place.
  const places = new Set(spec.questions.filter((x) => x.type === "mcq").map((x) => x.answer));
  expect(places.size).toBeGreaterThanOrEqual(3);
});
