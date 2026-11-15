require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const MonthlyGrade = require("../src/models/MonthlyGrade");
const { buildMonthlyReport } = require("../src/utils/monthlyReport");
const { targetFor } = require("../src/utils/monthlyReportAdvice");

// «تقريري الشهري»: the student downloads a PDF of a school month, worked out
// from their own marks beside their class's.
const binary = (res, cb) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const MONTH_ONE = ["2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11"];

const setUp = async ({ withTest = true, afterTest = true } = {}) => {
  const s = await f.school({ gradebook: { preparatory: "weekly40" }, features: { reportAfterTest: afterTest } });
  const g = await f.grade(s, { stage: "preparatory" });
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g], { name: "علوم" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c, { firstName: "سارة أحمد", gender: "female" });
  const { student: classmate } = await f.student(c);
  const account = await f.user("student", s, { studentProfile: student._id });

  // Homework 4 of 10 against the classmate's 10, conduct full for both.
  const t = await f.signIn(teacher);
  for (const weekStart of MONTH_ONE) {
    const saved = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart,
      list: [
        { studentId: String(student._id), homeworkScore: 4, attendanceScore: 10 },
        { studentId: String(classmate._id), homeworkScore: 10, attendanceScore: 10 },
      ],
    });
    expect(saved.status).toBe(200);
  }
  // Month 1's test (weekly40: term test 1), unless a test leaves it out.
  const testOne = () =>
    t.post("/api/term-tests/bulk", {
      classroomId: String(c._id),
      term: 1,
      testNo: 1,
      gradesList: [
        { studentId: String(student._id), grade: 12 },
        { studentId: String(classmate._id), grade: 14 },
      ],
    });
  if (withTest) expect((await testOne()).status).toBe(200);
  return { student, account, testOne, t, c, classmate };
};

test("the report reads the student's month beside the class's, and says what to do, to her", async () => {
  const { student } = await setUp();
  const report = await buildMonthlyReport({ studentId: student._id, monthNumber: 1, now: new Date("2026-11-01") });

  expect(report.complete).toBe(true);
  expect(report.student.firstName).toBe("سارة");
  const science = report.subjects.find((x) => x.subject === "علوم");
  const homework = science.columns.find((col) => col.key === "homeworkScore");
  expect(homework.average).toBe(4);
  expect(science.classTop).toBeGreaterThan(science.monthMark);
  expect(report.lost.find((l) => l.key === "homeworkScore")).toMatchObject({ lost: 6, possible: 10 });

  // The plan's first point is the homework, said to a girl.
  expect(report.advice.plan[0].title).toBe("الواجب في علوم");
  expect(report.advice.plan[0].text).toContain("سلّمي");
  expect(report.advice.strengths.join(" ")).toContain("خدتي درجة مواظبة وسلوك كاملة");
});

test("from month 2 the report gives her rank in the class, not the class's average", async () => {
  const { student, t, c, classmate } = await setUp();
  const { student: third } = await f.student(c);
  // Month 2: she ties the classmate on the weeks, a third pupil is below
  // them both; the test puts the classmate first.
  for (const weekStart of ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"]) {
    const saved = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart,
      list: [
        { studentId: String(student._id), homeworkScore: 8, attendanceScore: 10 },
        { studentId: String(classmate._id), homeworkScore: 8, attendanceScore: 10 },
        { studentId: String(third._id), homeworkScore: 2, attendanceScore: 6 },
      ],
    });
    expect(saved.status).toBe(200);
  }
  const testTwo = await t.post("/api/term-tests/bulk", {
    classroomId: String(c._id),
    term: 1,
    testNo: 2,
    gradesList: [
      { studentId: String(student._id), grade: 11 },
      { studentId: String(classmate._id), grade: 14 },
      { studentId: String(third._id), grade: 5 },
    ],
  });
  expect(testTwo.status).toBe(200);

  const two = await buildMonthlyReport({ studentId: student._id, monthNumber: 2, now: new Date("2026-11-20") });
  expect(two.ranked).toBe(true);
  expect(two.classOverall).toBeNull();
  expect(two.classRank).toMatchObject({ rank: 2, of: 3, shared: false });
  // The rank is the summary's line only — no rank per subject.
  const science = two.subjects.find((x) => x.subject === "علوم");
  expect(science.rank).toBeUndefined();
  expect(science.classAverage).toBeNull();
  expect(two.advice.summary.join(" ")).toContain("ترتيبك على الفصل التاني من 3");
  expect(two.advice.summary.join(" ")).not.toContain("متوسط فصلك");
  expect(JSON.stringify(two.advice)).not.toContain("متوسط فصلك");

  // Month 1, already printed, keeps the class's average and gives no rank.
  const one = await buildMonthlyReport({ studentId: student._id, monthNumber: 1, now: new Date("2026-11-20") });
  expect(one.ranked).toBe(false);
  expect(one.classRank).toBeNull();
  expect(one.classOverall).not.toBeNull();
  expect(one.advice.summary.join(" ")).toContain("متوسط فصلك");
});

test("pupils on the same marks share a rank", async () => {
  const { rankAmong } = require("../src/utils/monthlyReport");
  expect(rankAmong([30, 30, 25], 30)).toEqual({ rank: 1, of: 3, shared: true });
  expect(rankAmong([30, 30, 25, null], 25)).toEqual({ rank: 3, of: 3, shared: false });
  expect(rankAmong([30], null)).toBeNull();
});

test("targets step up to the next level, never past full marks", () => {
  expect(targetFor(12, 40)).toBe(18);
  expect(targetFor(27, 40)).toBe(30);
  expect(targetFor(31, 40)).toBe(34);
  expect(targetFor(39.5, 40)).toBe(40);
  expect(targetFor(40, 40)).toBe(40);
});

test("the student downloads her report through a signed link, for that month only", async () => {
  const { account } = await setUp();
  const st = await f.signIn(account);

  const list = await st.get("/api/student/monthly-reports");
  expect(list.status).toBe(200);
  expect(list.body.data.months.map((m) => m.month)).toContain(1);

  const name = "تقريري-الشهري-الشهر-الأول.pdf";
  const link = await st.get(`/api/student/monthly-reports/link?month=1&name=${encodeURIComponent(name)}`);
  expect(link.status).toBe(200);
  const { url } = link.body;

  // The phone's browser: no sign-in header.
  const pdf = await f.request(f.app).get(`/api${url}`).buffer(true).parse(binary);
  expect(pdf.status).toBe(200);
  expect(pdf.headers["content-type"]).toBe("application/pdf");
  expect(pdf.headers["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");

  // Bent to another month, it is refused.
  const other = await f.request(f.app).get(`/api${url.replace("month=1", "month=2")}`);
  expect(other.status).toBe(401);

  // Month 2 — still running, or over with nothing recorded — has no report;
  // a month not begun isn't offered.
  expect((await st.get("/api/student/monthly-report?month=2")).status).not.toBe(200);
  expect((await st.get("/api/student/monthly-report?month=8")).status).toBe(400);
  expect((await st.get("/api/student/monthly-reports/link?month=8")).status).toBe(400);
});

test("a month's report stays shut until its test is entered", async () => {
  const { account, testOne } = await setUp({ withTest: false });
  const st = await f.signIn(account);

  const one = async () => (await st.get("/api/student/monthly-reports")).body.data.months.find((m) => m.month === 1);
  expect(await one()).toMatchObject({ complete: false, waiting: ["علوم"] });

  for (const path of ["/api/student/monthly-reports/link?month=1", "/api/student/monthly-report?month=1"]) {
    const shut = await st.get(path);
    expect(shut.status).toBe(409);
    expect(shut.body.message).toContain("اختبار الشهر");
    expect(shut.body.message).toContain("علوم");
  }

  expect((await testOne()).status).toBe(200);
  expect(await one()).toMatchObject({ complete: true, waiting: [] });
  expect((await st.get("/api/student/monthly-reports/link?month=1")).status).toBe(200);
});

test("a school that doesn't hold reports for the test opens them as before", async () => {
  const { account } = await setUp({ withTest: false, afterTest: false });
  const st = await f.signIn(account);
  const list = await st.get("/api/student/monthly-reports");
  expect(list.body.data.months.find((m) => m.month === 1)).toMatchObject({ complete: true, waiting: [] });
  expect((await st.get("/api/student/monthly-reports/link?month=1")).status).toBe(200);
  expect((await st.get("/api/student/monthly-report?month=1")).status).toBe(200);
});

const MONTH_TWO = ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"];

test("from month 2 every school's report waits for the month's test", async () => {
  // A school that doesn't hold reports for the test: month 1 opens as before.
  const { account, t, c, student, classmate } = await setUp({ afterTest: false });
  for (const weekStart of MONTH_TWO) {
    const saved = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart,
      list: [student, classmate].map((p) => ({ studentId: String(p._id), homeworkScore: 8, attendanceScore: 10 })),
    });
    expect(saved.status).toBe(200);
  }
  const st = await f.signIn(account);
  const list = async () => (await st.get("/api/student/monthly-reports")).body.data.months;
  expect((await st.get("/api/student/monthly-reports/link?month=1")).status).toBe(200);

  // Month 2 stays shut until test 2 is entered.
  expect((await list()).find((m) => m.month === 2)).toMatchObject({ complete: false, waiting: ["علوم"] });
  const shut = await st.get("/api/student/monthly-reports/link?month=2");
  expect(shut.status).toBe(409);
  expect(shut.body.message).toContain("اختبار الشهر");
  expect((await st.get("/api/student/monthly-report?month=2")).status).toBe(409);

  const testTwo = await t.post("/api/term-tests/bulk", {
    classroomId: String(c._id),
    term: 1,
    testNo: 2,
    gradesList: [student, classmate].map((p) => ({ studentId: String(p._id), grade: 12 })),
  });
  expect(testTwo.status).toBe(200);
  expect((await list()).find((m) => m.month === 2)).toMatchObject({ complete: true, waiting: [] });
  expect((await st.get("/api/student/monthly-reports/link?month=2")).status).toBe(200);
});

test("a classic school's month 1 takes October's monthly test and month 2 waits for November's", async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g);
  const sub = await f.subject(s, [g], { name: "علوم" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  const account = await f.user("student", s, { studentProfile: student._id });
  const t = await f.signIn(teacher);
  for (const weekStart of [...MONTH_ONE, ...MONTH_TWO]) {
    const saved = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart,
      list: [{ studentId: String(student._id), homeworkScore: 4, classworkScore: 5 }],
    });
    expect(saved.status).toBe(200);
  }
  const test = (month, grade) =>
    MonthlyGrade.create({ student: student._id, subject: sub._id, classroom: c._id, teacher: teacher._id, school: s._id, month, year: 2026, grade });
  await test(10, 13);

  // October's test is month 1's.
  const one = await buildMonthlyReport({ studentId: student._id, monthNumber: 1, now: new Date("2026-11-20") });
  expect(one.subjects[0].test).toMatchObject({ grade: 13, max: 15 });

  // Month 2 is shut with October's test in, and opens with November's.
  const st = await f.signIn(account);
  expect((await st.get("/api/student/monthly-reports/link?month=2")).status).toBe(409);
  await test(11, 9);
  expect((await st.get("/api/student/monthly-reports/link?month=2")).status).toBe(200);
  const two = await buildMonthlyReport({ studentId: student._id, monthNumber: 2, now: new Date("2026-11-20") });
  expect(two.subjects[0].test).toMatchObject({ grade: 9, max: 15 });
});

test("nobody but a student gets a report", async () => {
  const { student } = await setUp();
  const parent = await f.user("parent", { _id: student.school });
  expect((await (await f.signIn(parent)).get("/api/student/monthly-report?month=1")).status).toBe(403);
  expect((await f.request(f.app).get("/api/student/monthly-report?month=1")).status).toBe(401);
});
