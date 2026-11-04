const jwt = require("jsonwebtoken");

// How long a sign-in lasts. Teachers and parents sign in once on their own
// phone and expect to stay in: the 30 days tokens used to carry ran out one
// teacher at a time a month after each first sign-in, and the app dropped
// them at the login screen (Al-Rahma, November 2026). Being let in is still
// decided on every request — a stopped account or school is refused at once
// (middleware/authMiddleware.js) — so a long life gives nothing away.
const LIFETIME_DAYS = 365;
const DAY = 24 * 60 * 60;

// A phone that uses the app gets a fresh token at most once a day, in the
// X-Session-Token response header, and keeps it. The year is counted from
// the last day the app was opened, not from the first sign-in.
const RENEW_AFTER_SECONDS = DAY;
const HEADER = "X-Session-Token";

const secret = () => process.env.JWT_SECRET;

const signSession = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, secret(), { expiresIn: `${LIFETIME_DAYS}d` });

// The signature is what proves a token; its age is checked here against the
// lifetime above rather than against the expiry written into it, so the
// 30-day tokens already on phones keep working for their year too. Throws
// (as jwt.verify does) for anything that isn't a token of ours.
const readSession = (token) => {
  const payload = jwt.verify(token, secret(), { ignoreExpiration: true });
  const age = Math.floor(Date.now() / 1000) - (payload.iat || 0);
  if (!payload.userId || !payload.iat || age > LIFETIME_DAYS * DAY) {
    throw new jwt.TokenExpiredError("session expired", new Date((payload.iat + LIFETIME_DAYS * DAY) * 1000));
  }
  return { ...payload, age };
};

const isTokenError = (err) => err instanceof jwt.JsonWebTokenError;

module.exports = { signSession, readSession, isTokenError, RENEW_AFTER_SECONDS, HEADER, LIFETIME_DAYS };
