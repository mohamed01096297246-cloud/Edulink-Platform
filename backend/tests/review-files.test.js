require("./helpers/setup");
const f = require("./helpers/factory");
const ReviewFile = require("../src/models/ReviewFile");
const Schedule = require("../src/models/Schedule");
const Student = require("../src/models/Student");
const User = require("../src/models/User");

// «ملفات المراجعة» on واجباتي: the revision files the school gave a grade —
// every student of that grade sees them, nobody else does.

const setUp = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const otherGrade = await f.grade(s);
  const c = await f.classroom(g);
  const c2 = await f.classroom(otherGrade);
  const arabic = await f.subject(s, [g, otherGrade], { name: "لغة عربية" });
  const { student } = await f.student(c);
  const { student: older } = await f.student(c2);
  const account = await f.user("student", s, { studentProfile: student._id });
  const olderAccount = await f.user("student", s, { studentProfile: older._id });
  return { s, g, otherGrade, c, arabic, student, account, olderAccount };
};

const url = (n) => `https://example.com/booklets/b${n}.pdf`;

test("a student sees their grade's published files, newest first, and no other grade's or school's", async () => {
  const r = await setUp();
  const elsewhere = await f.school();
  const elsewhereGrade = await f.grade(elsewhere);
  await ReviewFile.create({ school: r.s._id, grades: [r.g._id], subject: r.arabic._id, title: "بوصلة العربي", note: "١٨ بطاقة", url: url(1) });
  await ReviewFile.create({ school: r.s._id, grades: [r.g._id, r.otherGrade._id], title: "جدول الاختبارات", url: url(2) });
  await ReviewFile.create({ school: r.s._id, grades: [r.otherGrade._id], title: "بوصلة الصف الأكبر", url: url(3) });
  await ReviewFile.create({ school: r.s._id, grades: [r.g._id], title: "لم تُنشر بعد", url: url(4), published: false });
  await ReviewFile.create({ school: elsewhere._id, grades: [elsewhereGrade._id], title: "مدرسة أخرى", url: url(5) });

  const st = await f.signIn(r.account);
  const res = await st.get("/api/student/review-files");
  expect(res.status).toBe(200);
  expect(res.body.data.map((x) => x.title)).toEqual(["جدول الاختبارات", "بوصلة العربي"]);
  expect(res.body.data[1]).toMatchObject({ subject: "لغة عربية", note: "١٨ بطاقة", url: url(1) });

  const older = await f.signIn(r.olderAccount);
  const theirs = await older.get("/api/student/review-files");
  expect(theirs.body.data.map((x) => x.title).sort()).toEqual(["بوصلة الصف الأكبر", "جدول الاختبارات"].sort());
});

test("a second-language file reaches only that language's pupils", async () => {
  const r = await setUp();
  const french = await f.subject(r.s, [r.g], { name: "لغة فرنسية" });
  const german = await f.subject(r.s, [r.g], { name: "لغة ألمانية" });
  const fr = await f.user("teacher", r.s, { subjects: [french._id], teachingGrades: [r.g._id] });
  const de = await f.user("teacher", r.s, { subjects: [german._id], teachingGrades: [r.g._id] });
  const lesson = { school: r.s._id, classroom: r.c._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45", secondLanguage: true };
  await Schedule.create({ ...lesson, subject: french._id, teacher: fr._id });
  await Schedule.create({ ...lesson, subject: german._id, teacher: de._id });
  await Student.updateOne({ _id: r.student._id }, { $set: { secondLanguage: german._id } });
  await ReviewFile.create({ school: r.s._id, grades: [r.g._id], subject: french._id, title: "مراجعة الفرنسي", url: url(6) });
  await ReviewFile.create({ school: r.s._id, grades: [r.g._id], subject: german._id, title: "مراجعة الألماني", url: url(7) });

  const st = await f.signIn(r.account);
  const res = await st.get("/api/student/review-files");
  expect(res.body.data.map((x) => x.title)).toEqual(["مراجعة الألماني"]);
});

test("the homework switch closes the files too, and a parent can't call it", async () => {
  const r = await setUp();
  await ReviewFile.create({ school: r.s._id, grades: [r.g._id], title: "بوصلة العربي", url: url(8) });
  await User.updateOne({ _id: r.account._id }, { $set: { "appFeatures.homework": false } });
  const st = await f.signIn(r.account);
  expect((await st.get("/api/student/review-files")).status).toBe(403);

  const parent = await User.findById(r.student.parent);
  const p = await f.signIn(parent);
  expect((await p.get("/api/student/review-files")).status).toBe(403);
});

test("a file needs a grade and an https link", async () => {
  const r = await setUp();
  await expect(ReviewFile.create({ school: r.s._id, grades: [], title: "x", url: url(9) })).rejects.toThrow();
  await expect(ReviewFile.create({ school: r.s._id, grades: [r.g._id], title: "x", url: "http://example.com/a.pdf" })).rejects.toThrow();
});
