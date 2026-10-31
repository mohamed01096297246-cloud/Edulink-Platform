require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const Notification = require("../src/models/Notification");
const Attendance = require("../src/models/Attendance");
const { isInTotal } = require("../src/utils/subjectsInTotal");

// The student app: درجاتي shows the term's tests on weekly40, and the
// student reads the notices sent to them on a notifications screen.
const setUp = async () => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const other = await f.classroom(g);
  const sub = await f.subject(s, [g], { name: "علوم" });
  const teacher = await f.user("teacher", s, { firstName: "منى", lastName: "حسن", subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  const { student: classmate } = await f.student(c);
  const account = await f.user("student", s, { studentProfile: student._id });
  const classmateAccount = await f.user("student", s, { studentProfile: classmate._id });
  return { s, g, c, other, sub, teacher, student, account, classmateAccount };
};

test("درجاتي lists the term's tests on weekly40", async () => {
  const { c, teacher, student, account } = await setUp();
  const saved = await (await f.signIn(teacher)).post("/api/term-tests/bulk", {
    classroomId: String(c._id),
    term: 1,
    testNo: 1,
    gradesList: [{ studentId: String(student._id), grade: 13.5 }],
  });
  expect(saved.status).toBe(200);

  const res = await (await f.signIn(account)).get("/api/student/grades");
  expect(res.status).toBe(200);
  expect(res.body.data.tests).toMatchObject({
    scheme: "weekly40",
    groups: [{ title: "الترم الأول — الاختبار الأول", subjects: [expect.objectContaining({ name: "علوم", grade: 13.5, outOf: 15 })] }],
  });
  // Still there for apps from before.
  expect(res.body.data.exams).toEqual([]);
  expect(res.body.data.monthly).toEqual([]);
});

test("the student reads their own notices and the school's, says who sent each, and settles them", async () => {
  const { s, c, other, teacher, account, classmateAccount, student } = await setUp();
  const admin = await f.user("admin", s);
  const base = { school: s._id, createdBy: teacher._id };
  const mine = await Notification.create({ ...base, title: "واجب مدرسي جديد", message: "علوم ص 5", target: "student", user: account._id, student: student._id, type: "homework" });
  await Notification.create({ ...base, title: "لزميلك", message: "x", target: "student", user: classmateAccount._id, type: "homework" });
  const forClass = await Notification.create({ ...base, title: "رسالة للفصل", message: "y", target: "all", classrooms: [c._id] });
  await Notification.create({ ...base, title: "لفصل تاني", message: "z", target: "all", classrooms: [other._id] });
  const school = await Notification.create({ title: "إعلان المدرسة", message: "w", target: "all", school: s._id, createdBy: admin._id });
  await Notification.create({ title: "للابتدائي", message: "v", target: "all", stages: ["primary"], school: s._id, createdBy: admin._id });
  await Notification.create({ title: "لولي الأمر", message: "u", target: "parent", parent: admin._id, school: s._id, createdBy: admin._id });

  const st = await f.signIn(account);
  const list = await st.get("/api/student/notifications");
  expect(list.status).toBe(200);
  const byTitle = Object.fromEntries(list.body.data.map((n) => [n.title, n]));
  expect(Object.keys(byTitle).sort()).toEqual(["إعلان المدرسة", "رسالة للفصل", "واجب مدرسي جديد"].sort());
  expect(byTitle["واجب مدرسي جديد"]).toMatchObject({ from: "أ. منى حسن", read: false, type: "homework" });
  expect(byTitle["إعلان المدرسة"].from).toBe("إدارة المدرسة");

  expect((await st.get("/api/student/today")).body.data.unreadNotifications).toBe(3);

  // Settling them — and someone else's notice is left alone.
  const ids = [mine._id, forClass._id, school._id].map(String);
  const strangers = (await Notification.findOne({ title: "لزميلك" }))._id;
  const read = await f.request(f.app)
    .patch("/api/student/notifications/read")
    .set("Authorization", `Bearer ${st.token}`)
    .send({ ids: [...ids, String(strangers)] });
  expect(read.status).toBe(200);
  expect((await st.get("/api/student/today")).body.data.unreadNotifications).toBe(0);
  expect((await Notification.findById(strangers)).readBy).toHaveLength(0);
});

test("يومي counts attendance by the day: a day with any lesson missed is a day absent", async () => {
  const { s, c, sub, teacher, student, account } = await setUp();
  const second = await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 2, startTime: "09:00", endTime: "09:45" });
  const first = await Schedule.findOne({ classroom: c._id, period: 1 });
  const mark = (day, lesson, status, excused = false) =>
    Attendance.create({ student: student._id, date: new Date(`${day}T00:00:00.000Z`), status, excused, schedule: lesson._id, subject: sub._id, recordedBy: teacher._id, school: s._id });
  // Both lessons attended; one of two missed; only an excused absence; late.
  await mark("2026-10-04", first, "present");
  await mark("2026-10-04", second, "present");
  await mark("2026-10-05", first, "absent");
  await mark("2026-10-05", second, "present");
  await mark("2026-10-06", first, "absent", true);
  await mark("2026-10-07", first, "late");

  const today = (await (await f.signIn(account)).get("/api/student/today")).body.data;
  expect(today.attendance.days).toEqual({ present: 2, absent: 1 });
  // Lessons still there for apps from before.
  expect(today.attendance).toMatchObject({ present: 3, absent: 2, late: 1 });
});

test("أدائي says which subjects are in the total, and which weeks have no تقييم أسبوعي", async () => {
  const { s, g, c, teacher, student, account } = await setUp();
  await f.subject(s, [g], { name: "الدين" });
  const t = await f.signIn(teacher);
  for (const weekStart of ["2026-10-11", "2026-10-18"]) {
    const saved = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart,
      list: [{ studentId: String(student._id), homeworkScore: 8 }],
    });
    expect(saved.status).toBe(200);
  }

  const data = (await (await f.signIn(account)).get("/api/student/performance?term=1")).body.data;
  const bySubject = Object.fromEntries(data.subjects.map((x) => [x.subject, x]));
  expect(bySubject["علوم"].inTotal).toBe(true);
  expect(bySubject["الدين"].inTotal).toBe(false);
  const weeks = Object.fromEntries(bySubject["علوم"].weeks.map((w) => [new Date(w.weekStart).toISOString().slice(0, 10), w]));
  expect(weeks["2026-10-11"]).toMatchObject({ weeklyEvalApplies: true, homeworkScore: 8 });
  expect(weeks["2026-10-18"]).toMatchObject({ weeklyEvalApplies: false, homeworkScore: 8 });
});

test("the subjects in the total, as each school spells them", () => {
  // Every subject name on live on 2026-10-31.
  const inTotal = [
    "English", "Math", "Science", "دراسات", "رياضيات", "علوم", "لغة عربية",
    "انجليزي حكومي", "درسات", "لغة عربيه",
  ];
  const outside = [
    "اقتصاد منزلي", "تربية رياضية", "تربية فنية", "حاسب آلي + برمجة", "حاسب الي", "دين", "ريادة", "زراعه",
    "لغة ألمانية", "لغة فرنسية", "مكتبة", "مكتبه", "موسيقى",
    "الدين", "العاب", "القرءان الكريم", "انجليزي مستوي", "تربيه فنيه", "توكاتسو", "موسيقي", "حاسب آلي",
    "Computer Science",
  ];
  inTotal.forEach((name) => expect([name, isInTotal(name)]).toEqual([name, true]));
  outside.forEach((name) => expect([name, isInTotal(name)]).toEqual([name, false]));
});

test("a parent can't read the student's notices", async () => {
  const { s } = await setUp();
  const parent = await f.user("parent", s);
  expect((await (await f.signIn(parent)).get("/api/student/notifications")).status).toBe(403);
});
