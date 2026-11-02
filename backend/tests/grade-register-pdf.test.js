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

test("the Android app's download link: the browser gets the PDF without the sign-in header, for that request only", async () => {
  const { c, get } = await setUp();
  const name = "سجل-اسبوعي-2026-10-11.pdf";
  const link = await get(
    `/api/grade-register/link?path=/week/${c._id}&weekStart=2026-10-11&format=pdf&name=${encodeURIComponent(name)}`,
  );
  expect(link.status).toBe(200);
  const { url } = JSON.parse(link.body.toString());
  expect(url.startsWith(`/grade-register/week/${c._id}?`)).toBe(true);

  // What the phone's browser does: no Authorization header at all.
  const pdf = await f.request(f.app).get(`/api${url}`).buffer(true).parse(binary);
  expect(pdf.status).toBe(200);
  expect(pdf.headers["content-type"]).toBe("application/pdf");
  expect(pdf.headers["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");

  // The same link bent to another week, or another class, is refused — as
  // a page the browser can show, not JSON.
  const otherWeek = await f.request(f.app).get(`/api${url.replace("2026-10-11", "2026-10-04")}`);
  expect(otherWeek.status).toBe(401);
  expect(otherWeek.headers["content-type"]).toContain("text/html");
  expect(otherWeek.text).toContain("رابط التنزيل ده انتهى");
  const dl = new URLSearchParams(url.split("?")[1]).get("dl");
  const otherPath = await f.request(f.app).get(`/api/grade-register/month/${c._id}?schoolMonth=1&format=pdf&dl=${dl}`);
  expect(otherPath.status).toBe(401);

  // And it never works as a sign-in token.
  const asSignIn = await f.request(f.app).get("/api/grade-register/months").set("Authorization", `Bearer ${dl}`);
  expect(asSignIn.status).toBe(401);

  // Only the register's own paths get a link.
  const bad = await get(`/api/grade-register/link?path=/../auth/me`);
  expect(bad.status).toBe(400);
});

test("Arabic with numbers reads right to left, numbers and brackets kept whole", () => {
  const order = (t) => visualRuns(t).map((r) => (r.space ? "_" : r.text)).join("|");
  expect(order("مواظبة وسلوك (5)")).toBe("(|5|)|_|وسلوك|_|مواظبة");
  expect(order("المادة: رياضيات — أسبوع 2026/10/11")).toBe("2026/10/11|_|أسبوع|_|—|_|رياضيات|_|المادة:");
});
