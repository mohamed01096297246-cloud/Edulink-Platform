require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const Notification = require("../src/models/Notification");
const Homework = require("../src/models/Homework");
const { clock } = require("../src/utils/dailyAttendance");

// What a teacher does reaches the student as a notification (Mohamed,
// 2026-10-31): a mark recorded or changed, an absence, a homework changed —
// in the app and as a push on the app's «default» channel. A mark saved back
// unchanged says nothing.

// Every push the server sends, as Expo would receive it.
let pushed;
const realFetch = global.fetch;
beforeEach(() => {
  pushed = [];
  global.fetch = jest.fn(async (url, options) => {
    pushed.push(...JSON.parse(options.body));
    return { ok: true, text: async () => "" };
  });
});
afterEach(() => {
  global.fetch = realFetch;
});

const setUp = async ({ daily = false } = {}) => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" }, ...(daily ? { attendanceMode: "daily" } : {}) });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g], { name: "English" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const lesson = await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  // The younger years hold no account: nothing to tell.
  const { student: noAccount } = await f.student(c);
  const account = await f.user("student", s, { studentProfile: student._id, pushToken: "ExponentPushToken[student-1]" });
  return { s, g, c, sub, teacher, lesson, student, noAccount, account };
};

const noticesOf = (account) => Notification.find({ target: "student", user: account._id }).sort({ _id: 1 }).lean();

test("a weekly evaluation tells the student their mark, once, and again when it changes", async () => {
  const { c, teacher, student, noAccount, account } = await setUp();
  const t = await f.signIn(teacher);
  const save = (score) =>
    t.post("/api/weekly-evaluation/bulk", {
      classroomId: String(c._id),
      weekStart: "2026-10-25",
      gradesList: [
        { studentId: String(student._id), score },
        { studentId: String(noAccount._id), score: 12 },
      ],
    });

  expect((await save(18)).status).toBe(200);
  let notices = await noticesOf(account);
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    type: "grade",
    title: "درجة جديدة في English",
    message: "أسبوع 25 أكتوبر — التقييم الأسبوعي: 18 من 20",
  });
  expect(pushed).toEqual([
    expect.objectContaining({
      to: "ExponentPushToken[student-1]",
      title: "درجة جديدة في English",
      body: "أسبوع 25 أكتوبر — التقييم الأسبوعي: 18 من 20",
      channelId: "default",
      data: { type: "grade" },
    }),
  ]);
  // Only the student's own copy: no parent notice for a weekly mark.
  expect(await Notification.countDocuments({ target: "parent" })).toBe(0);

  // Saved back unchanged: nothing.
  expect((await save(18)).status).toBe(200);
  expect(await noticesOf(account)).toHaveLength(1);

  expect((await save(16.5)).status).toBe(200);
  notices = await noticesOf(account);
  expect(notices).toHaveLength(2);
  expect(notices[1]).toMatchObject({ title: "اتعدّلت درجتك في English", message: "أسبوع 25 أكتوبر — التقييم الأسبوعي: 16.5 من 20" });
});

test("الواجب and مواظبة وسلوك come in one notice; putting a column back to automatic says nothing", async () => {
  const { c, teacher, student, account } = await setUp();
  const t = await f.signIn(teacher);
  const saved = await t.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: "2026-10-25",
    list: [{ studentId: String(student._id), homeworkScore: 8, attendanceScore: 9.5 }],
  });
  expect(saved.status).toBe(200);
  expect(await noticesOf(account)).toEqual([
    expect.objectContaining({ message: "أسبوع 25 أكتوبر — الواجب: 8 من 10 · مواظبة وسلوك: 9.5 من 10" }),
  ]);

  await t.post("/api/coursework/week/bulk", {
    classroomId: String(c._id),
    weekStart: "2026-10-25",
    list: [{ studentId: String(student._id), homeworkScore: null }],
  });
  expect(await noticesOf(account)).toHaveLength(1);
});

test("a term test tells the student their grade", async () => {
  const { c, teacher, student, account } = await setUp();
  const saved = await (await f.signIn(teacher)).post("/api/term-tests/bulk", {
    classroomId: String(c._id),
    term: 1,
    testNo: 1,
    gradesList: [{ studentId: String(student._id), grade: 13.5 }],
  });
  expect(saved.status).toBe(200);
  expect(await noticesOf(account)).toEqual([
    expect.objectContaining({ type: "grade", title: "درجة جديدة في English", message: "الترم الأول — الاختبار الأول: 13.5 من 15" }),
  ]);
});

test("the day's register tells each student recorded absent, and no one else", async () => {
  const { s, c, teacher, lesson, student, account } = await setUp({ daily: true });
  const { student: present } = await f.student(c);
  const presentAccount = await f.user("student", s, { studentProfile: present._id });
  const realNow = clock.now;
  // Sunday 4/10/2026, 07:00 in Cairo: the day's register is open.
  clock.now = () => new Date("2026-10-04T04:00:00.000Z");
  try {
    const saved = await (await f.signIn(teacher)).post("/api/attendance/bulk", {
      scheduleId: String(lesson._id),
      selectedDate: "2026-10-04",
      records: [
        { student: String(student._id), status: "absent" },
        { student: String(present._id), status: "present" },
      ],
    });
    expect(saved.status).toBe(201);
  } finally {
    clock.now = realNow;
  }
  expect(await noticesOf(account)).toEqual([
    expect.objectContaining({
      type: "attendance",
      title: "اتسجّل غيابك",
      message: "اتسجّل غيابك يوم الأحد 4 أكتوبر. لو كنت حاضر كلّم معلمك.",
    }),
  ]);
  expect(await noticesOf(presentAccount)).toEqual([]);
});

test("a homework the teacher changes tells the class; a change to its marks alone doesn't", async () => {
  const { c, sub, teacher, account } = await setUp();
  const homework = await Homework.create({
    title: "Unit 3",
    pageNumber: "ص 10",
    dueDate: new Date("2026-11-01T00:00:00.000Z"),
    classroom: c._id,
    subject: sub._id,
    teacher: teacher._id,
    school: c.school,
  });
  const t = await f.signIn(teacher);
  expect((await t.put(`/api/homework/${homework._id}`, { totalMarks: 5 })).status).toBe(200);
  expect(await noticesOf(account)).toEqual([]);

  expect((await t.put(`/api/homework/${homework._id}`, { pageNumber: "ص 12" })).status).toBe(200);
  expect(await noticesOf(account)).toEqual([
    expect.objectContaining({ type: "homework", title: "اتعدّل واجب English", message: "Unit 3 · ص 12" }),
  ]);
});

test("a request naming another school's student tells them nothing", async () => {
  const a = await setUp();
  const b = await setUp();
  await (await f.signIn(a.teacher)).post("/api/weekly-evaluation/bulk", {
    classroomId: String(a.c._id),
    weekStart: "2026-10-25",
    gradesList: [{ studentId: String(b.student._id), score: 5 }],
  });
  expect(await noticesOf(b.account)).toEqual([]);
});
