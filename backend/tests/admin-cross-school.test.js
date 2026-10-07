require("./helpers/setup");
const f = require("./helpers/factory");
const mongoose = require("mongoose");
const Schedule = require("../src/models/Schedule");
const Exam = require("../src/models/Exam");
const Notification = require("../src/models/Notification");
const BellSchedule = require("../src/models/BellSchedule");
const Homework = require("../src/models/Homework");
const BoardNote = require("../src/models/BoardNote");
const Attendance = require("../src/models/Attendance");
const ClassAssignment = require("../src/models/ClassAssignment");

// An admin of school A reaches for every kind of record of school B, by id,
// to change it and to delete it. Every attempt must be refused and leave the
// record as it was.
let A;
let B;
beforeEach(async () => {
  const build = async () => {
    const s = await f.school({ attendanceMode: "daily" });
    const g = await f.grade(s);
    const c = await f.classroom(g);
    const sub = await f.subject(s, [g]);
    const admin = await f.user("admin", s);
    const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
    const { student, parent } = await f.student(c);
    return { s, g, c, sub, admin, teacher, student, parent };
  };
  A = await build();
  B = await build();
});

const records = async () => {
  const lesson = await Schedule.create({ school: B.s._id, classroom: B.c._id, subject: B.sub._id, teacher: B.teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  return {
    classrooms: B.c,
    grades: B.g,
    subjects: B.sub,
    schedules: lesson,
    exams: await Exam.create({ title: "B exam", examType: "midterm", academicYear: "2026/2027", grade: B.g._id, school: B.s._id, timetable: [] }),
    notifications: await Notification.create({ title: "B notice", message: "m", target: "all", createdBy: B.admin._id, school: B.s._id }),
    "bell-schedules": await BellSchedule.create({ name: "B bell", school: B.s._id, grades: [B.g._id], days: ["sun"], periods: [{ period: 1, startTime: "08:00", endTime: "08:45" }] }),
    homework: await Homework.create({ title: "B hw", pageNumber: "1", dueDate: new Date(), classroom: B.c._id, teacher: B.teacher._id, subject: B.sub._id, school: B.s._id }),
    "board-notes": await BoardNote.create({ caption: "B note", imageCount: 1, image: { data: Buffer.from("x"), contentType: "image/jpeg" }, classroom: B.c._id, teacher: B.teacher._id, subject: B.sub._id, school: B.s._id }),
    teacher: B.teacher,
    "admin/user": B.parent,
  };
};

const MODELS = {
  classrooms: "Classroom",
  grades: "Grade",
  subjects: "Subject",
  schedules: "Schedule",
  exams: "Exam",
  notifications: "Notification",
  "bell-schedules": "BellSchedule",
  homework: "Homework",
  "board-notes": "BoardNote",
  teacher: "User",
  "admin/user": "User",
};

test("an admin cannot edit or delete any record of another school", async () => {
  const targets = await records();
  const admin = await f.signIn(A.admin);
  const leaks = [];

  for (const [path, doc] of Object.entries(targets)) {
    const Model = mongoose.model(MODELS[path]);
    const before = JSON.stringify(await Model.findById(doc._id).lean());

    const put = await admin.put(`/api/${path}/${doc._id}`, { name: "HACKED", title: "HACKED", firstName: "HACKED", message: "HACKED" });
    if (![400, 403, 404].includes(put.status)) leaks.push(`PUT /api/${path} → ${put.status}`);
    const del = await admin.del(`/api/${path}/${doc._id}`);
    if (![400, 403, 404].includes(del.status)) leaks.push(`DELETE /api/${path} → ${del.status}`);

    const after = await Model.findById(doc._id).lean();
    if (!after) leaks.push(`${path}: record deleted`);
    else if (JSON.stringify(after) !== before) leaks.push(`${path}: record changed`);
  }

  expect(leaks).toEqual([]);
});

test("an admin cannot reach another school's attendance or assignments", async () => {
  const lesson = await Schedule.create({ school: B.s._id, classroom: B.c._id, subject: B.sub._id, teacher: B.teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const mark = await Attendance.create({ student: B.student._id, date: new Date(Date.UTC(2026, 9, 4)), status: "absent", schedule: lesson._id, subject: B.sub._id, recordedBy: B.teacher._id, school: B.s._id });
  await ClassAssignment.create({ school: B.s._id, teacher: B.teacher._id, classroom: B.c._id, subject: B.sub._id });
  const admin = await f.signIn(A.admin);

  expect([403, 404]).toContain((await admin.get(`/api/attendance/${mark._id}`)).status);
  const reg = await admin.put("/api/attendance/register", { classroomId: String(B.c._id), date: "2026-10-04", students: [{ studentId: String(B.student._id), status: "present" }] });
  expect([400, 403, 404]).toContain(reg.status);
  expect((await Attendance.findById(mark._id)).status).toBe("absent");

  const assign = await admin.put(`/api/class-assignments/teacher/${B.teacher._id}`, { assignments: [] });
  expect([400, 403, 404]).toContain(assign.status);
  expect(await ClassAssignment.countDocuments({ teacher: B.teacher._id })).toBe(1);
});
