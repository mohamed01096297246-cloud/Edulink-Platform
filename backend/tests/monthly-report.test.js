require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
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
  return { student, account, testOne };
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

test("nobody but a student gets a report", async () => {
  const { student } = await setUp();
  const parent = await f.user("parent", { _id: student.school });
  expect((await (await f.signIn(parent)).get("/api/student/monthly-report?month=1")).status).toBe(403);
  expect((await f.request(f.app).get("/api/student/monthly-report?month=1")).status).toBe(401);
});
