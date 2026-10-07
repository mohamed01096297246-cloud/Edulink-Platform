require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const Exam = require("../src/models/Exam");
const Result = require("../src/models/Result");
const Behavior = require("../src/models/Behavior");
const Homework = require("../src/models/Homework");
const HomeworkResult = require("../src/models/HomeworkResult");

// Marks and notes are what reach a family, so nobody may write them for a
// student who isn't theirs to mark — and an admin may only edit their own
// school's.
const buildSchool = async () => {
  const s = await f.school({ attendanceMode: "daily" });
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const admin = await f.user("admin", s);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const lesson = await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student, parent } = await f.student(c);
  const exam = await Exam.create({ title: "Midterm", examType: "midterm", academicYear: "2026/2027", grade: g._id, school: s._id, timetable: [] });
  return { s, g, c, sub, admin, teacher, lesson, student, parent, exam };
};

let A;
let B;
beforeEach(async () => {
  A = await buildSchool();
  B = await buildSchool();
});

const refused = (res) => expect([400, 403, 404]).toContain(res.status);

describe("exam marks", () => {
  test("a teacher records marks for their own class", async () => {
    const t = await f.signIn(A.teacher);
    const res = await t.post("/api/results/add", {
      examId: String(A.exam._id),
      subjectId: String(A.sub._id),
      gradesList: [{ studentId: String(A.student._id), grade: 88 }],
    });
    expect(res.status).toBe(200);
    expect((await Result.findOne({ student: A.student._id })).grade).toBe(88);
  });

  test("a teacher cannot record marks for another school's student", async () => {
    const t = await f.signIn(A.teacher);
    refused(await t.post("/api/results/add", {
      examId: String(B.exam._id),
      subjectId: String(B.sub._id),
      gradesList: [{ studentId: String(B.student._id), grade: 1 }],
    }));
    refused(await t.post("/api/results/single", {
      examId: String(B.exam._id),
      subjectId: String(B.sub._id),
      studentId: String(B.student._id),
      grade: 1,
    }));
    expect(await Result.countDocuments({ student: B.student._id })).toBe(0);
  });

  test("an admin cannot change or delete another school's exam mark", async () => {
    const mark = await Result.create({ student: B.student._id, exam: B.exam._id, subject: B.sub._id, grade: 70, teacher: B.teacher._id, school: B.s._id });
    const admin = await f.signIn(A.admin);
    refused(await admin.put(`/api/results/update/${mark._id}`, { grade: 0 }));
    refused(await admin.del(`/api/results/delete/${mark._id}`));
    const fresh = await Result.findById(mark._id);
    expect(fresh).toBeTruthy();
    expect(fresh.grade).toBe(70);
  });
});

describe("behaviour notes", () => {
  test("a teacher cannot write a note on another school's lesson", async () => {
    const t = await f.signIn(A.teacher);
    refused(await t.post("/api/behavior/bulk", {
      scheduleId: String(B.lesson._id),
      selectedDate: "2026-10-04",
      behaviorRecords: [{ studentId: String(B.student._id), type: "negative", note: "planted" }],
    }));
    expect(await Behavior.countDocuments({ student: B.student._id })).toBe(0);
  });

  test("a teacher's note on their own lesson only reaches that class's students", async () => {
    const t = await f.signIn(A.teacher);
    const res = await t.post("/api/behavior/bulk", {
      scheduleId: String(A.lesson._id),
      selectedDate: "2026-10-04",
      behaviorRecords: [
        { studentId: String(A.student._id), type: "positive", note: "good" },
        { studentId: String(B.student._id), type: "negative", note: "planted" },
      ],
    });
    expect(res.status).toBe(201);
    expect(await Behavior.countDocuments({ student: A.student._id })).toBe(1);
    expect(await Behavior.countDocuments({ student: B.student._id })).toBe(0);
  });

  test("an admin cannot delete another school's note", async () => {
    const note = await Behavior.create({ student: B.student._id, teacher: B.teacher._id, subject: B.sub._id, classroom: B.c._id, date: new Date(), type: "positive", note: "kept", school: B.s._id });
    const admin = await f.signIn(A.admin);
    refused(await admin.del(`/api/behavior/${note._id}`));
    expect(await Behavior.exists({ _id: note._id })).toBeTruthy();
  });
});

describe("homework marks", () => {
  test("marking a homework only touches students of its class", async () => {
    const hw = await Homework.create({ title: "hw", pageNumber: "1", dueDate: new Date(), totalMarks: 10, classroom: A.c._id, teacher: A.teacher._id, subject: A.sub._id, school: A.s._id });
    const t = await f.signIn(A.teacher);
    const res = await t.post(`/api/homework-results/grade/${hw._id}`, {
      grades: [
        { studentId: String(A.student._id), status: "submitted", score: 9 },
        { studentId: String(B.student._id), status: "submitted", score: 9 },
      ],
    });
    expect([200, 201]).toContain(res.status);
    expect(await HomeworkResult.countDocuments({ student: A.student._id })).toBe(1);
    expect(await HomeworkResult.countDocuments({ student: B.student._id })).toBe(0);
  });
});
