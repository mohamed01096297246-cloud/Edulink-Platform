require("./helpers/setup");
const f = require("./helpers/factory");
const Homework = require("../src/models/Homework");
const HomeworkResult = require("../src/models/HomeworkResult");

// The teacher's homework list says, for each homework, whether its marks
// have been entered and when — so the grading screen can show what's done
// and what's left.
test("each homework carries how many students were marked, when, and the class size", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const { student: a } = await f.student(c);
  await f.student(c);

  const base = { pageNumber: "1", dueDate: new Date(), classroom: c._id, teacher: teacher._id, subject: sub._id, school: s._id };
  const done = await Homework.create({ ...base, title: "done" });
  await Homework.create({ ...base, title: "waiting" });
  await HomeworkResult.create({ homework: done._id, student: a._id, status: "submitted", gradedBy: teacher._id, school: s._id });

  const res = await (await f.signIn(teacher)).get(`/api/homework?gradeId=${g._id}`);
  expect(res.status).toBe(200);
  const byTitle = Object.fromEntries(res.body.data.map((h) => [h.title, h.grading]));
  expect(byTitle.done.gradedCount).toBe(1);
  expect(byTitle.done.gradedAt).toBeTruthy();
  expect(byTitle.done.classSize).toBe(2);
  expect(byTitle.waiting).toEqual({ gradedCount: 0, gradedAt: null, classSize: 2 });
});

// A teacher deleted homework she had already marked; for every child in the
// class the parent's الواجبات page — where a board-note notice leads —
// failed with "Cannot read properties of null (reading '_id')".
test("a marked homework that was deleted doesn't break the parent's homework page", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const { student, parent } = await f.student(c);
  const base = { pageNumber: "1", classroom: c._id, teacher: teacher._id, subject: sub._id, school: s._id };
  const gone = await Homework.create({ ...base, title: "deleted", dueDate: new Date() });
  await Homework.create({ ...base, title: "open", dueDate: new Date(Date.now() + 86400000) });
  await HomeworkResult.create({ homework: gone._id, student: student._id, status: "submitted", gradedBy: teacher._id, school: s._id });
  expect((await (await f.signIn(teacher)).del(`/api/homework/${gone._id}`)).status).toBe(200);

  const res = await (await f.signIn(parent)).get(`/api/homework-results/dashboard/${student._id}`);
  expect(res.status).toBe(200);
  expect(res.body.data.activeAssignments.map((h) => h.title)).toEqual(["open"]);
  expect(res.body.data.historyAndResults).toEqual([]);
});

// A teacher had homework set for a class that was later deleted; the list
// failed for her with "input must be a 24 character hex string".
test("homework whose classroom was deleted doesn't break the teacher's list", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const gone = await f.classroom(g);
  const sub = await f.subject(s, [g]);
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  const base = { pageNumber: "1", dueDate: new Date(), teacher: teacher._id, subject: sub._id, school: s._id };
  await Homework.create({ ...base, title: "kept", classroom: c._id });
  await Homework.create({ ...base, title: "orphan", classroom: gone._id });
  await gone.deleteOne();

  const res = await (await f.signIn(teacher)).get("/api/homework");
  expect(res.status).toBe(200);
  expect(res.body.data.map((h) => h.title).sort()).toEqual(["kept", "orphan"]);
});
