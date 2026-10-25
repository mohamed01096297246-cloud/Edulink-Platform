require("./helpers/setup");
const ExcelJS = require("exceljs");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const {
  schoolMonth,
  monthsOfTerm,
  termOfDate,
  monthsBegun,
  schoolMonthStartingIn,
} = require("../src/utils/schoolMonths");
const { toHalf } = require("../src/utils/halfMarks");

// The school's month is four school weeks in a row, counted from the first
// marked week, not a calendar month. The month sheet, the term sheet and
// أدائي all add up the same months.
const day = (d) => d.toISOString().slice(0, 10);

const binary = (res, cb) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const sheetOf = async (session, url) => {
  const res = await session.get(url).buffer(true).parse(binary);
  expect(res.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  return workbook.worksheets[0];
};

const texts = (sheet) => {
  const out = [];
  sheet.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value))));
  return out;
};

const setUp = async ({ weekly40 = false } = {}) => {
  const s = await f.school(weekly40 ? { gradebook: { preparatory: "weekly40" } } : {});
  const g = await f.grade(s, weekly40 ? { stage: "preparatory" } : {});
  const c = await f.classroom(g, { name: "1/1" });
  const sub = await f.subject(s, [g], { name: "رياضيات" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  const { student } = await f.student(c);
  const t = await f.signIn(teacher);
  const evaluate = async (weekStart, score) => {
    const res = await t.post("/api/weekly-evaluation/bulk", {
      classroomId: String(c._id),
      weekStart,
      gradesList: [{ studentId: String(student._id), score }],
    });
    expect(res.status).toBe(200);
  };
  return { s, c, student, t, evaluate };
};

test("a month is four school weeks from the first marked week, each term counting afresh", () => {
  const first = schoolMonth(1);
  expect(first.label).toBe("الشهر الأول");
  expect(first.weekStarts.map(day)).toEqual(["2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11"]);
  expect([day(first.from), day(first.to)]).toEqual(["2026-09-20", "2026-10-15"]);
  expect([day(schoolMonth(2).from), day(schoolMonth(2).to)]).toEqual(["2026-10-18", "2026-11-12"]);
  expect(monthsOfTerm(1).map((m) => m.month)).toEqual([1, 2, 3, 4]);
  expect(day(monthsOfTerm(1)[3].to)).toBe("2027-01-07");
  expect(day(schoolMonth(5).from)).toBe("2027-02-07");
  expect(schoolMonth(9)).toBeNull();
  expect(termOfDate(new Date("2027-01-20T00:00:00Z"))).toBe(1);
  expect(termOfDate(new Date("2027-02-06T00:00:00Z"))).toBe(2);

  // Saturday opens the next school week, and with it the next month.
  expect(monthsBegun(new Date("2026-10-16T10:00:00Z")).map((m) => m.month)).toEqual([1]);
  expect(monthsBegun(new Date("2026-10-17T10:00:00Z")).map((m) => m.month)).toEqual([1, 2]);

  // An app that still offers calendar months gets the school month that
  // starts in the one picked.
  expect(schoolMonthStartingIn(10, 2026).month).toBe(2);
  expect(schoolMonthStartingIn(1, 2027)).toBeNull();
});

test("the month sheet prints the month's four weeks and averages the recorded ones", async () => {
  const { c, t, evaluate } = await setUp();
  // Weeks 2, 3 and 5 recorded, week 4 not yet; week 6 opens the next month.
  await evaluate("2026-09-20", 8);
  await evaluate("2026-09-27", 6);
  await evaluate("2026-10-11", 10);
  // Week 7 (week 6 has no تقييم أسبوعي) is in the next month.
  await evaluate("2026-10-25", 2);

  const sheet = await sheetOf(t, `/api/grade-register/month/${c._id}?schoolMonth=1`);
  const all = texts(sheet);
  expect(all).toContain("المادة: رياضيات — الشهر الأول (من 2026/09/20 إلى 2026/10/15)");
  ["2026/09/20", "2026/09/27", "2026/10/04", "2026/10/11"].forEach((d, i) =>
    expect(all).toContain(`الأسبوع ${i + 1} (${d})`),
  );
  expect(all.some((x) => x.includes("2026/10/18"))).toBe(false);

  // The student's row: four weeks of five columns, then the averages.
  const row = sheet.getRow(8);
  const at = (col) => row.getCell(col).value;
  expect([at(4), at(9), at(14), at(19)]).toEqual([8, 6, "-", 10]);
  expect(at(24)).toBe(8); // تقييم averaged over the three recorded weeks
  expect(at(28)).toBe(8);

  // An app from before school months asks for October: the month starting
  // in it. January starts none.
  const legacy = await sheetOf(t, `/api/grade-register/month/${c._id}?month=10&year=2026`);
  expect(texts(legacy)).toContain("المادة: رياضيات — الشهر الثاني (من 2026/10/18 إلى 2026/11/12)");
  expect((await t.get(`/api/grade-register/month/${c._id}?month=1&year=2027`)).status).toBe(400);

  // A month with nothing recorded says so.
  expect((await t.get(`/api/grade-register/month/${c._id}?schoolMonth=3`)).status).toBe(404);
});

test("an average prints as a whole mark or a half, and the month's total adds them up", async () => {
  // Mohamed's examples (9.3 → 9.5, 9.6 → 9.5, 9.7 → 10), read to one decimal.
  expect([9.2, 9.3, 9.6, 9.7, 9, 4.25, 4.6, 4.8].map(toHalf)).toEqual([9, 9.5, 9.5, 10, 9, 4.5, 4.5, 5]);
  expect(toHalf(null)).toBeNull();

  const { c, student, t, evaluate } = await setUp();
  const homework = async (weekStart, homeworkScore) => {
    const res = await t.post("/api/coursework/week/bulk", {
      classroomId: String(c._id),
      weekStart,
      list: [{ studentId: String(student._id), homeworkScore }],
    });
    expect(res.status).toBe(200);
  };
  // تقييم 9, 9, 10 (9.33) and واجب 4.25, 5, 4.5 (4.58).
  for (const [week, score, mark] of [["2026-09-20", 9, 4.25], ["2026-09-27", 9, 5], ["2026-10-04", 10, 4.5]]) {
    await evaluate(week, score);
    await homework(week, mark);
  }

  const row = (await sheetOf(t, `/api/grade-register/month/${c._id}?schoolMonth=1`)).getRow(8);
  const at = (col) => row.getCell(col).value;
  // متوسط الأسابيع — مواظبة، تقييم، واجب، كراسة، إجمالي — then المجموع.
  expect([at(23), at(24), at(25), at(26), at(27), at(28)]).toEqual(["-", 9.5, 4.5, "-", 14, 14]);
});

test("the app is offered the months begun so far, with their days", async () => {
  const { t } = await setUp();
  const res = await t.get("/api/grade-register/months");
  expect(res.status).toBe(200);
  expect(res.body.data[0]).toMatchObject({ month: 1, term: 1, label: "الشهر الأول", from: "2026-09-20", to: "2026-10-15" });
  expect(res.body.data[res.body.data.length - 1].current).toBe(true);
});

test("weekly40: the month sheet, the term sheet and أدائي add up the same months", async () => {
  const { s, c, student, t, evaluate } = await setUp({ weekly40: true });
  // الشهر الأول: 20, 10, 12; الشهر الثاني: 16 — all but the first in October.
  await evaluate("2026-09-20", 20);
  await evaluate("2026-10-04", 10);
  await evaluate("2026-10-11", 12);
  await evaluate("2026-10-25", 16); // week 7: week 6 has no تقييم أسبوعي

  const month = await sheetOf(t, `/api/grade-register/month/${c._id}?schoolMonth=1`);
  expect(texts(month)).toContain("المادة: رياضيات — الشهر الأول (من 2026/09/20 إلى 2026/10/15)");
  // Four weeks of four columns after م and الاسم, then the average.
  expect(month.getRow(8).getCell(19).value).toBe(14);

  const term = await sheetOf(t, `/api/grade-register/term/${c._id}?term=1`);
  const all = texts(term);
  ["الأول", "الثاني", "الثالث", "الرابع"].forEach((n) => expect(all).toContain(`الشهر ${n} (40)`));
  const row = term.getRow(8);
  expect([3, 4, 5, 6, 7].map((col) => row.getCell(col).value)).toEqual([14, 16, "-", "-", 15]);

  const account = await f.user("student", s, { studentProfile: student._id });
  const mine = await (await f.signIn(account)).get("/api/student/performance?term=1");
  expect(mine.status).toBe(200);
  const [subject] = mine.body.data.subjects;
  expect(subject.monthAverages.map((m) => [m.schoolMonth, m.label, m.average])).toEqual([
    [1, "الشهر الأول", 14],
    [2, "الشهر الثاني", 16],
    [3, "الشهر الثالث", null],
    [4, "الشهر الرابع", null],
  ]);
  // An older app names each by the calendar month it starts in.
  expect(subject.monthAverages.map((m) => m.month)).toEqual([9, 10, 11, 12]);
  expect(subject.weeksAverage).toBe(15);
});
