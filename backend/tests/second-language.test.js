require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const BellSchedule = require("../src/models/BellSchedule");
const Student = require("../src/models/Student");
const School = require("../src/models/School");
const Homework = require("../src/models/Homework");
const Notification = require("../src/models/Notification");

// Future's «مادة ثانية»: one period a class spends split between French and
// German, each pupil sitting the language on their record.
const future = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const other = await f.classroom(g);
  await BellSchedule.create({
    school: s._id,
    name: "Main",
    grades: [g._id],
    days: ["sun", "mon", "tue", "wed", "thu"],
    periods: [
      { period: 1, startTime: "08:00", endTime: "08:45" },
      { period: 2, startTime: "08:50", endTime: "09:35" },
      { period: 3, startTime: "09:40", endTime: "10:25" },
    ],
  });
  const french = await f.subject(s, [g], { name: "لغة فرنسية" });
  const german = await f.subject(s, [g], { name: "لغة ألمانية" });
  const math = await f.subject(s, [g], { name: "رياضيات" });
  const fr = await f.user("teacher", s, { subjects: [french._id], teachingGrades: [g._id] });
  const de = await f.user("teacher", s, { subjects: [german._id], teachingGrades: [g._id] });
  const mt = await f.user("teacher", s, { subjects: [math._id], teachingGrades: [g._id] });
  const admin = await f.user("admin", s);
  const kidFr = await f.student(c);
  const kidDe = await f.student(c);
  const kidNone = await f.student(c);
  return { s, g, c, other, french, german, math, fr, de, mt, admin, kidFr, kidDe, kidNone };
};

const row = (r, extra) =>
  Schedule.create({ school: r.s._id, classroom: r.c._id, day: "sun", startTime: "08:00", endTime: "08:45", period: 1, ...extra });

// The period itself, two rows, as the timetable page books it.
const splitPeriod = (r, period = 1, times = ["08:00", "08:45"]) =>
  Promise.all([
    row(r, { subject: r.french._id, teacher: r.fr._id, period, startTime: times[0], endTime: times[1], secondLanguage: true }),
    row(r, { subject: r.german._id, teacher: r.de._id, period, startTime: times[0], endTime: times[1], secondLanguage: true }),
  ]);

const ids = (list) => list.map((x) => String(x._id || x)).sort();

test("the timetable books «مادة ثانية» as one period with a teacher per language", async () => {
  const r = await future();
  const a = await f.signIn(r.admin);
  const book = (body) => a.post("/api/schedules", { classroom: String(r.c._id), day: "sun", ...body });
  const options = [
    { subjectId: String(r.french._id), teacher: String(r.fr._id) },
    { subjectId: String(r.german._id), teacher: String(r.de._id) },
  ];

  const made = await book({ periods: [1], secondLanguage: true, options });
  expect(made.status).toBe(201);
  const rows = await Schedule.find({ classroom: r.c._id, period: 1 }).lean();
  expect(rows).toHaveLength(2);
  expect(rows.every((x) => x.secondLanguage && x.startTime === "08:00")).toBe(true);
  expect(ids(rows.map((x) => x.teacher))).toEqual(ids([r.fr, r.de]));

  // The class is taken at that time, for an ordinary lesson…
  const clash = await book({ periods: [1], teacher: String(r.mt._id), subjectId: String(r.math._id) });
  expect(clash.status).toBe(400);
  expect(clash.body.message).toMatch(/الفصل عنده حصة/);
  // …one teacher can't take both languages, and a teacher busy elsewhere can't come.
  const sameTeacher = await book({
    periods: [2],
    secondLanguage: true,
    options: [options[0], { subjectId: String(r.german._id), teacher: String(r.fr._id) }],
  });
  expect(sameTeacher.status).toBe(400);
  await Schedule.create({ school: r.s._id, classroom: r.other._id, subject: r.german._id, teacher: r.de._id, day: "sun", period: 3, startTime: "09:40", endTime: "10:25" });
  const busy = await book({ periods: [3], secondLanguage: true, options });
  expect(busy.status).toBe(400);
  expect(busy.body.message).toMatch(/المعلم عنده حصة تانية/);

  // An ordinary French lesson turned into «مادة ثانية» keeps its row — and
  // with it the registers taken on it — and gains the German one.
  const old = await row(r, { subject: r.french._id, teacher: r.fr._id, period: 2, startTime: "08:50", endTime: "09:35" });
  const turned = await book({ periods: [2], secondLanguage: true, options, replaceIds: [String(old._id)] });
  expect(turned.status).toBe(201);
  const second = await Schedule.find({ classroom: r.c._id, period: 2 }).lean();
  expect(second).toHaveLength(2);
  const kept = second.find((x) => String(x._id) === String(old._id));
  expect(kept.secondLanguage).toBe(true);
  expect(String(kept.subject)).toBe(String(r.french._id));
});

test("each pupil's language decides who is on each teacher's list, and what the family sees", async () => {
  const r = await future();
  await splitPeriod(r);
  await row(r, { subject: r.math._id, teacher: r.mt._id, period: 2, startTime: "08:50", endTime: "09:35" });
  const a = await f.signIn(r.admin);

  // The admin gives each pupil a language — only one the class has.
  const wrong = await a.put("/api/students/second-language", {
    classroom: String(r.c._id),
    assignments: [{ student: String(r.kidFr.student._id), language: String(r.math._id) }],
  });
  expect(wrong.status).toBe(400);
  const set = await a.put("/api/students/second-language", {
    classroom: String(r.c._id),
    assignments: [
      { student: String(r.kidFr.student._id), language: String(r.french._id) },
      { student: String(r.kidDe.student._id), language: String(r.german._id) },
    ],
  });
  expect(set.status).toBe(200);
  const list = (await a.get(`/api/students/second-language?classroom=${r.c._id}`)).body.data;
  expect(list.languages.map((l) => l.name).sort()).toEqual(["لغة ألمانية", "لغة فرنسية"]);
  expect(list.students.find((x) => String(x._id) === String(r.kidNone.student._id)).secondLanguage).toBeNull();

  // Each language teacher has their pupils and the ones not yet given one;
  // the math teacher has the whole class.
  const roster = async (teacher) =>
    ids((await (await f.signIn(teacher)).get(`/api/teacher/dashboard?classroomId=${r.c._id}`)).body.currentClassStudents);
  expect(await roster(r.de)).toEqual(ids([r.kidDe.student, r.kidNone.student]));
  expect(await roster(r.fr)).toEqual(ids([r.kidFr.student, r.kidNone.student]));
  expect(await roster(r.mt)).toEqual(ids([r.kidFr.student, r.kidDe.student, r.kidNone.student]));
  const evaluation = await (await f.signIn(r.de)).get(`/api/weekly-evaluation/classroom/${r.c._id}?weekStart=2026-10-04`);
  expect(ids(evaluation.body.data.students)).toEqual(ids([r.kidDe.student, r.kidNone.student]));

  // A pupil's timetable shows their language with its teacher; one without
  // a language yet sees «مادة ثانية» and no teacher.
  const sunday = async (kid) => {
    const account = await f.user("student", r.s, { studentProfile: kid.student._id });
    const res = await (await f.signIn(account)).get("/api/student/schedule");
    return res.body.data.days.find((d) => d.day === "sun").lessons.map((l) => `${l.subject}|${l.teacher}`);
  };
  expect(await sunday(r.kidDe)).toEqual([`لغة ألمانية|${r.de.firstName} ${r.de.lastName}`, `رياضيات|${r.mt.firstName} ${r.mt.lastName}`]);
  expect(await sunday(r.kidNone)).toEqual(["مادة ثانية|", `رياضيات|${r.mt.firstName} ${r.mt.lastName}`]);
  const parentView = (await (await f.signIn(r.kidFr.parent)).get(`/api/schedules/class/${r.c._id}`)).body;
  expect(parentView.filter((l) => l.period === 1).map((l) => l.subject.name)).toEqual(["لغة فرنسية"]);

  // German homework reaches German families (and the undecided), and stays
  // off the French family's list.
  const t = await f.signIn(r.de);
  const hw = await t.post("/api/homework", { title: "Lektion 3", pageNumber: "12", grade: String(r.g._id), classroomId: String(r.c._id) });
  expect(hw.status).toBe(201);
  let notified = [];
  for (let i = 0; i < 40 && notified.length < 2; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- the notice is sent after the reply.
    notified = await Notification.find({ type: "homework", target: "parent" }).lean();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => setTimeout(done, 25));
  }
  expect(ids(notified.map((n) => n.parent))).toEqual(ids([r.kidDe.parent, r.kidNone.parent]));
  expect(await Homework.countDocuments({ subject: r.german._id })).toBe(1);
  const homeworkOf = async (kid) =>
    (await (await f.signIn(kid.parent)).get(`/api/homework/student/${kid.student._id}`)).body.data.map((h) => h.title);
  expect(await homeworkOf(r.kidFr)).toEqual([]);
  expect(await homeworkOf(r.kidDe)).toEqual(["Lektion 3"]);
  expect(await homeworkOf(r.kidNone)).toEqual(["Lektion 3"]);
});

test("the day's register moves past a split first period to the class's first whole lesson", async () => {
  const r = await future();
  await School.updateOne({ _id: r.s._id }, { $set: { attendanceMode: "daily" } });
  await splitPeriod(r);
  await row(r, { subject: r.math._id, teacher: r.mt._id, period: 2, startTime: "08:50", endTime: "09:35" });

  const firsts = async (teacher) =>
    (await (await f.signIn(teacher)).get("/api/attendance/daily/first-lessons")).body.data.lessons;
  expect((await firsts(r.mt)).map((l) => `${l.day}|${l.period}`)).toEqual(["sun|2"]);
  expect(await firsts(r.fr)).toEqual([]);
  expect(await firsts(r.de)).toEqual([]);
});

test("a class with no «مادة ثانية» period is untouched by its pupils' languages", async () => {
  const r = await future();
  // A French-only class: every pupil takes French, whatever their record says.
  await row(r, { subject: r.french._id, teacher: r.fr._id });
  await Student.updateOne({ _id: r.kidDe.student._id }, { $set: { secondLanguage: r.german._id } });
  const roster = (await (await f.signIn(r.fr)).get(`/api/teacher/dashboard?classroomId=${r.c._id}`)).body.currentClassStudents;
  expect(roster).toHaveLength(3);
  const a = await f.signIn(r.admin);
  const refused = await a.put("/api/students/second-language", {
    classroom: String(r.c._id),
    assignments: [{ student: String(r.kidFr.student._id), language: String(r.french._id) }],
  });
  expect(refused.status).toBe(400);
});
