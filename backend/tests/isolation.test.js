require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const BoardNote = require("../src/models/BoardNote");
const Homework = require("../src/models/Homework");

// Two schools side by side. Nothing anyone at one may see or touch anything
// of the other's — every test signs in as someone at A and reaches for B.
const buildSchool = async () => {
  const s = await f.school({ attendanceMode: "daily" });
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const admin = await f.user("admin", s);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student, parent } = await f.student(c);
  return { s, g, c, sub, admin, teacher, student, parent };
};

let A;
let B;
beforeEach(async () => {
  A = await buildSchool();
  B = await buildSchool();
});

const notOk = (res) => expect([401, 403, 404]).toContain(res.status);

describe("an admin of one school", () => {
  test("lists only their own students", async () => {
    const admin = await f.signIn(A.admin);
    const res = await admin.get("/api/students");
    expect(res.status).toBe(200);
    const ids = (res.body.data || res.body).map((s) => String(s._id));
    expect(ids).toContain(String(A.student._id));
    expect(ids).not.toContain(String(B.student._id));
  });

  test("cannot open, edit or read the record of another school's student", async () => {
    const admin = await f.signIn(A.admin);
    notOk(await admin.get(`/api/students/${B.student._id}`));
    notOk(await admin.get(`/api/students/${B.student._id}/record`));
    notOk(await admin.put(`/api/students/${B.student._id}`, { firstName: "Hacked" }));
    const fresh = await require("../src/models/Student").findById(B.student._id);
    expect(fresh.firstName).not.toBe("Hacked");
  });

  test("cannot send a notice to another school's class", async () => {
    const admin = await f.signIn(A.admin);
    const res = await admin.post("/api/notifications", {
      title: "t",
      message: "m",
      target: "classrooms",
      classroomIds: [String(B.c._id)],
    });
    expect(res.status).toBe(403);
  });

  test("sees only their own teachers in the grade-entry report", async () => {
    const admin = await f.signIn(A.admin);
    const res = await admin.get("/api/analytics/grade-entry?period=week");
    expect(res.status).toBe(200);
    const ids = res.body.teachers.map((t) => t.id);
    expect(ids).toContain(String(A.teacher._id));
    expect(ids).not.toContain(String(B.teacher._id));
  });

  test("lists only their own classes and timetable", async () => {
    const admin = await f.signIn(A.admin);
    const classes = await admin.get("/api/classrooms");
    const classIds = (classes.body.data || classes.body).map((c) => String(c._id));
    expect(classIds).toContain(String(A.c._id));
    expect(classIds).not.toContain(String(B.c._id));

    const lessons = await admin.get("/api/schedules");
    const lessonClasses = (lessons.body.data || lessons.body).map((l) => String(l.classroom?._id || l.classroom));
    expect(lessonClasses).not.toContain(String(B.c._id));
  });
});

describe("a parent", () => {
  test("cannot read another family's child, in either school", async () => {
    const parent = await f.signIn(A.parent);
    const { student: neighbour } = await f.student(A.c);

    for (const other of [B.student, neighbour]) {
      notOk(await parent.get(`/api/students/${other._id}`));
      notOk(await parent.get(`/api/attendance/student/${other._id}`));
      notOk(await parent.get(`/api/parent/report/${other._id}`));
    }
  });

  test("cannot open a board-note photo from another school", async () => {
    const note = await BoardNote.create({
      caption: "B's board",
      imageCount: 1,
      image: { data: Buffer.from("not really a jpeg"), contentType: "image/jpeg" },
      classroom: B.c._id,
      teacher: B.teacher._id,
      subject: B.sub._id,
      school: B.s._id,
    });
    const parent = await f.signIn(A.parent);
    notOk(await parent.get(`/api/board-notes/${note._id}/image`));
    notOk(await parent.get(`/api/board-notes/${note._id}/image/0`));
  });
});

describe("a teacher", () => {
  test("still reads and saves marks for their own class", async () => {
    const teacher = await f.signIn(A.teacher);
    expect((await teacher.get(`/api/weekly-evaluation/classroom/${A.c._id}?weekStart=2026-09-20`)).status).toBe(200);
    const res = await teacher.post("/api/weekly-evaluation/bulk", {
      classroomId: String(A.c._id),
      weekStart: "2026-09-21",
      gradesList: [{ studentId: String(A.student._id), score: 7.5 }],
    });
    expect(res.status).toBe(200);
    const saved = await require("../src/models/WeeklyEvaluation").findOne({ student: A.student._id }).lean();
    expect(saved.score).toBe(7.5);
    // A Monday is filed under its week's Sunday.
    expect(saved.weekStart.toISOString().slice(0, 10)).toBe("2026-09-20");
  });

  test("cannot reach a class of their own school that they don't teach", async () => {
    const otherGrade = await f.grade(A.s);
    const otherClass = await f.classroom(otherGrade);
    const teacher = await f.signIn(A.teacher);
    notOk(await teacher.get(`/api/weekly-evaluation/classroom/${otherClass._id}?weekStart=2026-09-20`));
  });

  test("cannot read another school's class marks", async () => {
    const teacher = await f.signIn(A.teacher);
    notOk(await teacher.get(`/api/weekly-evaluation/classroom/${B.c._id}?weekStart=2026-09-20`));
  });

  test("cannot delete another school's homework", async () => {
    const hw = await Homework.create({
      title: "B homework",
      pageNumber: "1",
      dueDate: new Date(),
      classroom: B.c._id,
      teacher: B.teacher._id,
      subject: B.sub._id,
      school: B.s._id,
    });
    const teacher = await f.signIn(A.teacher);
    notOk(await teacher.del(`/api/homework/${hw._id}`));
    expect(await Homework.exists({ _id: hw._id })).toBeTruthy();
  });

  test("cannot save marks into another school's class", async () => {
    const teacher = await f.signIn(A.teacher);
    const res = await teacher.post("/api/weekly-evaluation/bulk", {
      classroomId: String(B.c._id),
      weekStart: "2026-09-20",
      gradesList: [{ studentId: String(B.student._id), score: 5 }],
    });
    notOk(res);
    expect(await require("../src/models/WeeklyEvaluation").countDocuments({ student: B.student._id })).toBe(0);
  });
});
