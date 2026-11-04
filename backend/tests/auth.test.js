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

describe("staying signed in", () => {
  const jwt = require("jsonwebtoken");
  const User = require("../src/models/User");
  const DAY = 24 * 60 * 60;
  // A token as the server signed it some days ago, with the expiry it had.
  const tokenFrom = (user, daysAgo, expiresInDays) => {
    const iat = Math.floor(Date.now() / 1000) - daysAgo * DAY;
    return jwt.sign({ userId: user._id, role: user.role, iat, exp: iat + expiresInDays * DAY }, process.env.JWT_SECRET);
  };
  const me = (token) => f.request(f.app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

  test("a 30-day token from 40 days ago still works, and is answered with a fresh one that works", async () => {
    const s = await f.school();
    const teacher = await f.user("teacher", s);
    const old = await me(tokenFrom(teacher, 40, 30));
    expect(old.status).toBe(200);
    const renewed = old.headers["x-session-token"];
    expect(renewed).toBeTruthy();
    expect(jwt.decode(renewed).exp - jwt.decode(renewed).iat).toBe(365 * DAY);
    const again = await me(renewed);
    expect(again.status).toBe(200);
    // Fresh, so not renewed again on every request.
    expect(again.headers["x-session-token"]).toBeUndefined();
  });

  test("a sign-in lasts a year; past that, or forged, it is refused", async () => {
    const s = await f.school();
    const teacher = await f.user("teacher", s);
    const login = await f.request(f.app).post("/api/auth/login").send({ username: teacher.username, password: f.PASSWORD });
    const { iat, exp } = jwt.decode(login.body.token);
    expect(exp - iat).toBe(365 * DAY);

    expect((await me(tokenFrom(teacher, 366, 365))).status).toBe(401);
    const forged = jwt.sign({ userId: teacher._id, role: "teacher" }, "not-our-secret");
    expect((await me(forged)).status).toBe(401);
    expect((await me("garbage")).status).toBe(401);
  });

  test("the database failing is not a sign-out: it answers 503, never 401", async () => {
    const s = await f.school();
    const teacher = await f.user("teacher", s);
    const { token } = await f.signIn(teacher);
    const spy = jest.spyOn(User, "findById").mockImplementationOnce(() => {
      throw new Error("Operation `users.findOne()` buffering timed out after 10000ms");
    });
    const res = await me(token);
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect((await me(token)).status).toBe(200);
  });
});

describe("health", () => {
  test("/api/health reports the database connection", async () => {
    const res = await f.request(f.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected" });
  });
});
