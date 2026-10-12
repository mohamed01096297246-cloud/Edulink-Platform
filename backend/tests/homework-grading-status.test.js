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
