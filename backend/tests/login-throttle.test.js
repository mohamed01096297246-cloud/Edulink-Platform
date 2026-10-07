require("./helpers/setup");
const f = require("./helpers/factory");
const throttle = require("../src/utils/loginThrottle");

beforeEach(() => throttle._failures.clear());

const attempt = (username, password) => f.request(f.app).post("/api/auth/login").send({ username, password });

describe("password guessing", () => {
  test("ten wrong passwords lock the account for a while, even against the right one", async () => {
    const s = await f.school();
    const t = await f.user("teacher", s, { username: "123456" });

    for (let i = 0; i < throttle.PER_ADDRESS; i++) {
      expect((await attempt("123456", `wrong${i}`)).status).toBe(401);
    }
    const locked = await attempt("123456", f.PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.token).toBeUndefined();

    // Someone else signing in from the same place is not affected.
    const other = await f.user("teacher", s, { username: "654321" });
    expect((await attempt(other.username, f.PASSWORD)).status).toBe(200);
    expect(t).toBeTruthy();
  });

  test("a successful sign-in clears the count", async () => {
    const s = await f.school();
    await f.user("teacher", s, { username: "222222" });
    for (let i = 0; i < throttle.PER_ADDRESS - 1; i++) await attempt("222222", "wrong");
    expect((await attempt("222222", f.PASSWORD)).status).toBe(200);
    for (let i = 0; i < throttle.PER_ADDRESS - 1; i++) {
      expect((await attempt("222222", "wrong")).status).toBe(401);
    }
  });

  test("guessing at a username that doesn't exist is limited the same way", async () => {
    for (let i = 0; i < throttle.PER_ADDRESS; i++) expect((await attempt("999999", "x")).status).toBe(401);
    expect((await attempt("999999", "x")).status).toBe(429);
  });
});
