require("./helpers/setup");
const path = require("path");
const f = require("./helpers/factory");
const Quiz = require("../src/models/Quiz");
const QuizAttempt = require("../src/models/QuizAttempt");
const User = require("../src/models/User");
const Student = require("../src/models/Student");
const Schedule = require("../src/models/Schedule");
const Grade = require("../src/models/Grade");

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
  expect(open.direction).toBe("rtl");
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

test("after sending, the student is told which lessons to go back to, most missed first", async () => {
  const { account, s, c } = await setUp();
  const tfq = (text, lesson, extra = {}) => ({ type: "tf", text, lesson, choices: ["صح", "غلط"], answer: 0, ...extra });
  const q = await Quiz.create({
    school: s._id,
    title: "مراجعة",
    subjectName: "علوم",
    classrooms: [c._id],
    published: true,
    questions: [
      tfq("١", "الروابط الكيميائية"),
      tfq("٢", "الروابط الكيميائية"),
      tfq("٣", "القوى الكهربية"),
      tfq("٤", "القوى الكهربية"),
      tfq("٥", "القوى المغناطيسية"),
      // No lesson: the section stands in for it.
      tfq("٦", undefined, { section: "قوى الجاذبية" }),
    ],
  });
  const st = await f.signIn(account);
  const open = (await st.get(`/api/student/quizzes/${q._id}`)).body.data.quiz;
  const id = (text) => open.questions.find((x) => x.text === text).id;
  // Bonds: 1 of 2 wrong. Electricity: both wrong (one left). Magnetism right. Gravity wrong.
  const sent = await st.post(`/api/student/quizzes/${q._id}/submit`, {
    answers: { [id("١")]: 0, [id("٢")]: 1, [id("٣")]: 1, [id("٥")]: 0, [id("٦")]: 1 },
  });
  const review = sent.body.data.review;
  expect(review.toReview.map((l) => [l.lesson, l.wrong, l.questions])).toEqual([
    ["القوى الكهربية", 2, 2],
    ["قوى الجاذبية", 1, 1],
    ["الروابط الكيميائية", 1, 2],
  ]);
  expect(review.lessons.map((l) => l.lesson)).toEqual(["الروابط الكيميائية", "القوى الكهربية", "القوى المغناطيسية", "قوى الجاذبية"]);
  expect(review.questions[0].lesson).toBe("الروابط الكيميائية");
  // While the quiz is being taken the lesson isn't sent; it only matters once marked.
  expect(open.questions[0].lesson).toBeUndefined();

  // All right: nothing to go back to.
  await QuizAttempt.deleteMany({});
  const all = await st.post(`/api/student/quizzes/${q._id}/submit`, {
    answers: Object.fromEntries(open.questions.map((x) => [x.id, 0])),
  });
  expect(all.body.data.review.toReview).toEqual([]);
});

test("an English quiz reads left to right, in the questions and in the result", async () => {
  const { account, q } = await setUp({ quiz: { direction: "ltr" } });
  const st = await f.signIn(account);
  expect((await st.get("/api/student/quizzes")).body.data.quizzes[0].direction).toBe("ltr");
  const open = (await st.get(`/api/student/quizzes/${q._id}`)).body.data.quiz;
  expect(open.direction).toBe("ltr");
  const sent = await st.post(`/api/student/quizzes/${q._id}/submit`, { answers: {} });
  expect(sent.body.data.review.quiz.direction).toBe("ltr");
  await expect(new Quiz({ ...q.toObject(), _id: undefined, direction: "up" }).validate()).rejects.toThrow();
});

test("in a class split between French and German, each pupil gets their own language's quiz", async () => {
  const { s, c, account, q } = await setUp();
  const g = await Grade.findById(c.grade);
  const french = await f.subject(s, [g], { name: "لغة فرنسية" });
  const german = await f.subject(s, [g], { name: "لغة ألمانية" });
  const slot = { school: s._id, classroom: c._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45", secondLanguage: true };
  await Schedule.create([{ ...slot, subject: french._id }, { ...slot, subject: german._id }]);
  const questions = q.questions.map((x) => x.toObject());
  const base = { school: s._id, classrooms: [c._id], published: true, questions, direction: "ltr" };
  const frQuiz = await Quiz.create({ ...base, title: "Français", subjectName: "لغة فرنسية", subject: french._id });
  await Quiz.create({ ...base, title: "Deutsch", subjectName: "لغة ألمانية", subject: german._id });

  const titlesFor = async (acc) =>
    (await (await f.signIn(acc)).get("/api/student/quizzes")).body.data.quizzes.map((x) => x.title).sort();

  // No language set yet: every language's quiz, as on the registers.
  expect(await titlesFor(account)).toEqual(["Deutsch", "Français", "امتحان الوحدة الأولى"]);

  // A German pupil: the German one and the class's others, never the French.
  const { student: kidDe } = await f.student(c);
  await Student.updateOne({ _id: kidDe._id }, { secondLanguage: german._id });
  const de = await f.user("student", s, { studentProfile: kidDe._id });
  expect(await titlesFor(de)).toEqual(["Deutsch", "امتحان الوحدة الأولى"]);
  const deApi = await f.signIn(de);
  expect((await deApi.get(`/api/student/quizzes/${frQuiz._id}`)).status).toBe(404);
  expect((await deApi.post(`/api/student/quizzes/${frQuiz._id}/submit`, { answers: {} })).status).toBe(404);

  // A French pupil: the French one.
  const { student: kidFr } = await f.student(c);
  await Student.updateOne({ _id: kidFr._id }, { secondLanguage: french._id });
  const fr = await f.user("student", s, { studentProfile: kidFr._id });
  expect(await titlesFor(fr)).toEqual(["Français", "امتحان الوحدة الأولى"]);

  // A class whose French is a plain period (no German beside it): everyone.
  const other = await f.classroom(g);
  await Schedule.create({ ...slot, classroom: other._id, subject: french._id, secondLanguage: false });
  await Quiz.updateOne({ _id: frQuiz._id }, { $push: { classrooms: other._id } });
  const { student: kidPlain } = await f.student(other);
  await Student.updateOne({ _id: kidPlain._id }, { secondLanguage: german._id });
  const plain = await f.user("student", s, { studentProfile: kidPlain._id });
  expect(await titlesFor(plain)).toEqual(["Français"]);
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

const QUIZ_FILES = require("fs")
  .readdirSync(path.resolve(__dirname, "../scripts/quizzes"))
  .filter((name) => name.endsWith(".json"));

test.each(QUIZ_FILES)("the quiz file %s is a valid quiz: every answer one of its choices, every question explained", async (name) => {
  const spec = require(path.resolve(__dirname, "../scripts/quizzes", name));
  const s = await f.school();
  const quiz = new Quiz({
    school: s._id,
    title: spec.title,
    subjectName: spec.subjectName,
    direction: spec.direction,
    passages: spec.passages,
    questions: spec.questions,
  });
  await expect(quiz.validate()).resolves.toBeUndefined();
  expect(spec.questions.length).toBeGreaterThanOrEqual(25);
  // Listening, reading and poetry questions are asked on the text shown.
  spec.questions
    // ("Complete" alone is the English text with numbered blanks; "Complete
    // the statements" in science is single sentences.)
    .filter((x) => /الاستماع|القراءة|الشعري|Reading|Listening|Dialog|^Complete$|Compréhension|Texterfassung/i.test(x.section))
    .forEach((x) => expect(x.passage).toBeTruthy());
  // صح / غلط in an Arabic quiz, Vrai / Faux in French, Richtig / Falsch in
  // German, True / False in the other ones that read left to right.
  const trueFalse = /فرنسية/.test(spec.subjectName)
    ? ["Vrai", "Faux"]
    : /ألمانية/.test(spec.subjectName)
      ? ["Richtig", "Falsch"]
      : spec.direction === "ltr"
      ? ["True", "False"]
      : ["صح", "غلط"];
  spec.questions.forEach((x) => {
    expect(x.explanation.length).toBeGreaterThan(5);
    // Every question names its lesson, for «راجع الدروس دي» after the quiz.
    expect(x.lesson).toBeTruthy();
    if (x.type === "tf") expect(x.choices).toEqual(trueFalse);
  });
  // The right answer isn't always in the same place, nor mostly in one.
  const mcq = spec.questions.filter((x) => x.type === "mcq");
  const places = new Set(mcq.map((x) => x.answer));
  expect(places.size).toBeGreaterThanOrEqual(3);
  [0, 1, 2, 3].forEach((i) => expect(mcq.filter((x) => x.answer === i).length).toBeLessThan(mcq.length * 0.45));
  // No two questions the same, and every choice of a question different.
  expect(new Set(spec.questions.map((x) => x.text)).size).toBe(spec.questions.length);
  spec.questions.forEach((x) => expect(new Set(x.choices).size).toBe(x.choices.length));
});
