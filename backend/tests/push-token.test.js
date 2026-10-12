require("./helpers/setup");
const f = require("./helpers/factory");
const User = require("../src/models/User");

// A push token is one phone. Whoever signed in on the phone last owns it, and
// signing out on it stops that account's pushes reaching it.
let s;
beforeEach(async () => {
  s = await f.school();
});

test("signing in on a phone takes its token off the account that used it before", async () => {
  const teacher = await f.user("teacher", s);
  const parent = await f.user("parent", s);
  const phone = "ExponentPushToken[same-phone]";

  await (await f.signIn(teacher)).put("/api/auth/push-token", { pushToken: phone });
  await (await f.signIn(parent)).put("/api/auth/push-token", { pushToken: phone });

  expect((await User.findById(teacher._id)).pushToken).toBeNull();
  expect((await User.findById(parent._id)).pushToken).toBe(phone);
});

test("signing out clears this phone's token, not another phone's", async () => {
  const teacher = await f.user("teacher", s);
  const session = await f.signIn(teacher);
  await session.put("/api/auth/push-token", { pushToken: "ExponentPushToken[phone-b]" });

  // An older phone signing out must not cut off the phone now in use.
  await session.post("/api/auth/push-token/clear", { pushToken: "ExponentPushToken[phone-a]" });
  expect((await User.findById(teacher._id)).pushToken).toBe("ExponentPushToken[phone-b]");

  await session.post("/api/auth/push-token/clear", { pushToken: "ExponentPushToken[phone-b]" });
  expect((await User.findById(teacher._id)).pushToken).toBeNull();
});
