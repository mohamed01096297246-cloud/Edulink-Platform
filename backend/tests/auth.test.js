require("./helpers/setup");
const f = require("./helpers/factory");
const School = require("../src/models/School");

describe("login", () => {
  test("a phone username signs in however it is typed", async () => {
    const s = await f.school();
    const parent = await f.user("parent", s, { username: "01000000000", phoneNumber: "01000000000" });

    for (const typed of ["01000000000", "+2001000000000", "+20 100 000 0000", "00201000000000", "٠١٠٠٠٠٠٠٠٠٠"]) {
      const res = await f.request(f.app).post("/api/auth/login").send({ username: typed, password: f.PASSWORD });
      expect({ typed, status: res.status }).toEqual({ typed, status: 200 });
      expect(String(res.body.user._id || res.body.user.id)).toBe(String(parent._id));
    }
  });

  test("a wrong password is refused, even with a normalised username", async () => {
    const s = await f.school();
    await f.user("parent", s, { username: "01000000001", phoneNumber: "01000000001" });
    const res = await f.request(f.app).post("/api/auth/login").send({ username: "+2001000000001", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test("an inactive account cannot sign in", async () => {
    const s = await f.school();
    const t = await f.user("teacher", s, { active: false });
    const res = await f.request(f.app).post("/api/auth/login").send({ username: t.username, password: f.PASSWORD });
    expect(res.status).not.toBe(200);
    expect(res.body.token).toBeUndefined();
  });

  test("suspending a school cuts off a token that was already issued", async () => {
    const s = await f.school();
    const admin = await f.user("admin", s);
    const session = await f.signIn(admin);
    expect((await session.get("/api/students")).status).toBe(200);

    await School.updateOne({ _id: s._id }, { active: false });
    expect((await session.get("/api/students")).status).toBe(403);
  });

  test("no token, no data", async () => {
    const res = await f.request(f.app).get("/api/students");
    expect(res.status).toBe(401);
  });
});

describe("health", () => {
  test("/api/health reports the database connection", async () => {
    const res = await f.request(f.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected" });
  });
});
