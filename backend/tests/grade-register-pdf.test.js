require("./helpers/setup");
const f = require("./helpers/factory");
const Schedule = require("../src/models/Schedule");
const { visualRuns } = require("../src/utils/sheetPdf");

// The grade register as a PDF any phone opens, drawn from the same workbook
// as the Excel file; the Excel stays the default.
const binary = (res, cb) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

const setUp = async () => {
  const s = await f.school();
  const g = await f.grade(s);
  const c = await f.classroom(g, { name: "1/1" });
  const sub = await f.subject(s, [g], { name: "رياضيات" });
  const teacher = await f.user("teacher", s, { subjects: [sub._id], teachingGrades: [g._id] });
  await Schedule.create({ school: s._id, classroom: c._id, subject: sub._id, teacher: teacher._id, day: "sun", period: 1, startTime: "08:00", endTime: "08:45" });
  for (let i = 0; i < 3; i += 1) await f.student(c);
  const { token } = await f.signIn(teacher);
  const get = (url) => f.request(f.app).get(url).set("Authorization", `Bearer ${token}`).buffer(true).parse(binary);
  return { c, get };
};

test("the weekly register comes as a PDF when asked, and as Excel otherwise", async () => {
  const { c, get } = await setUp();
  const url = `/api/grade-register/week/${c._id}?weekStart=2026-10-11`;

  const pdf = await get(`${url}&format=pdf`);
  expect(pdf.status).toBe(200);
  expect(pdf.headers["content-type"]).toBe("application/pdf");
  expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.body.length).toBeGreaterThan(5000);

  const xlsx = await get(url);
  expect(xlsx.status).toBe(200);
  expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
  expect(xlsx.body.subarray(0, 2).toString()).toBe("PK");
});

test("Arabic with numbers reads right to left, numbers and brackets kept whole", () => {
  const order = (t) => visualRuns(t).map((r) => (r.space ? "_" : r.text)).join("|");
  expect(order("مواظبة وسلوك (5)")).toBe("(|5|)|_|وسلوك|_|مواظبة");
  expect(order("المادة: رياضيات — أسبوع 2026/10/11")).toBe("2026/10/11|_|أسبوع|_|—|_|رياضيات|_|المادة:");
});
