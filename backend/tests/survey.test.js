require("./helpers/setup");
const f = require("./helpers/factory");
const Survey = require("../src/models/Survey");

// The app-subscription survey: the platform owner starts it for a school,
// anyone with the link answers it with no login (the school's own classes
// only), and the owner reads the answers class by class. An answer is a
// subscription at the survey's one price (300); the page shows no price.
const setUp = async () => {
  const s = await f.school({ name: "مدارس فيوتشر" });
  const g = await f.grade(s, { name: "الصف الأول الإعدادي" });
  const a = await f.classroom(g, { name: "A" });
  const b = await f.classroom(g, { name: "B" });
  await f.student(a);
  await f.student(a);
  await f.student(b);
  const other = await f.classroom(await f.grade(await f.school()), { name: "Z" });
  const owner = await f.user("admin", null, { isSuperAdmin: true, isPrimaryAdmin: false });
  const o = await f.signIn(owner);
  return { s, g, a, b, other, o };
};

const answer = (slug, body) => f.request(f.app).post(`/api/surveys/public/${slug}/responses`).send(body);

test("a school's survey is answered from its link and counted class by class", async () => {
  const { s, a, b, other, o } = await setUp();

  expect((await o.get(`/api/surveys/school/${s._id}`)).body.data.survey).toBeNull();
  const created = await o.post(`/api/surveys/school/${s._id}`, {});
  expect(created.status).toBe(201);
  const { slug } = created.body.data.survey;
  expect(slug).toMatch(/^[0-9a-f]{10}$/);
  // Asking again hands back the same survey.
  expect((await o.post(`/api/surveys/school/${s._id}`, {})).body.data.survey.slug).toBe(slug);

  const page = await f.request(f.app).get(`/api/surveys/public/${slug}`);
  expect(page.status).toBe(200);
  expect(page.body.data).toMatchObject({ school: "مدارس فيوتشر", open: true });
  expect(page.body.data).not.toHaveProperty("price");
  expect(page.body.data).not.toHaveProperty("prices");
  expect(page.body.data.grades).toHaveLength(1);
  expect(page.body.data.grades[0].classrooms.map((c) => c.name)).toEqual(["A", "B"]);

  // The class is all an answer takes.
  expect((await answer(slug, { classroomId: String(a._id) })).status).toBe(201);
  expect((await answer(slug, { classroomId: String(a._id) })).status).toBe(201);
  // A page opened before the question went still says «لا»: not a subscriber.
  expect((await answer(slug, { classroomId: String(b._id), phone: "android", subscribe: false })).status).toBe(201);
  // Another school's class, or none.
  expect((await answer(slug, { classroomId: String(other._id) })).status).toBe(400);
  expect((await answer(slug, {})).status).toBe(400);
  expect((await f.request(f.app).get("/api/surveys/public/nothing")).status).toBe(404);

  const res = await o.get(`/api/surveys/school/${s._id}`);
  expect(res.body.data.survey.price).toBe(300);
  expect(res.body.data.totals).toMatchObject({ subscribers: 2, declined: 1, amount: 600, price: 300, students: 3 });
  expect(res.body.data.classes.map((c) => [c.classroom, c.students, c.subscribers, c.declined, c.amount])).toEqual([
    ["A", 2, 2, 0, 600],
    ["B", 1, 0, 1, 0],
  ]);
});

test("a survey started before the single price is priced at 300", async () => {
  const { s, a, o } = await setUp();
  // As the real one was stored: two prices, no `price`.
  await Survey.collection.insertOne({ school: s._id, slug: "0123456789", title: "استبيان الاشتراك في التطبيق", prices: { android: 250, iphone: 300 }, open: true });
  expect((await answer("0123456789", { classroomId: String(a._id) })).status).toBe(201);
  const res = await o.get(`/api/surveys/school/${s._id}`);
  expect(res.body.data.survey.price).toBe(300);
  expect(res.body.data.totals).toMatchObject({ subscribers: 1, amount: 300 });
});

test("a closed survey takes no answers, and only the platform owner manages it", async () => {
  const { s, a, o } = await setUp();
  const { slug } = (await o.post(`/api/surveys/school/${s._id}`, {})).body.data.survey;

  const admin = await f.signIn(await f.user("admin", s));
  expect((await admin.get(`/api/surveys/school/${s._id}`)).status).toBe(403);
  expect((await admin.put(`/api/surveys/school/${s._id}`, { open: false })).status).toBe(403);

  expect((await o.put(`/api/surveys/school/${s._id}`, { open: false })).body.data.survey.open).toBe(false);
  expect((await answer(slug, { classroomId: String(a._id) })).status).toBe(403);
  const page = await f.request(f.app).get(`/api/surveys/public/${slug}`);
  expect(page.body.data).toMatchObject({ open: false, grades: [] });
});
