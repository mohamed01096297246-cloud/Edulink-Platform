const jwt = require("jsonwebtoken");

// A link the phone's browser opens to download a file the app could only
// fetch with its sign-in header — so Android saves it in Download with its
// own «تم التنزيل», instead of the app handing it to a share sheet.
// Signed for one user and one exact request, good for a few minutes, and
// with a key of its own so it can never stand in for a sign-in token.
const secret = () => `${process.env.JWT_SECRET}:download-link`;
const LIFETIME = "10m";

const signLink = (userId, path, query) =>
  jwt.sign({ userId: String(userId), path, query }, secret(), { expiresIn: LIFETIME });

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// The browser shows what the server says, so a refusal goes out as a short
// Arabic page rather than raw JSON.
const page = (message) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>EduLink</title></head>
<body style="font-family:sans-serif;padding:28px 20px;font-size:19px;line-height:1.8;color:#0f172a;background:#fff">
<p style="font-weight:700">${escapeHtml(message)}</p><p>ارجع لتطبيق EduLink.</p></body></html>`;

// Before `protect`: ?dl=<link> stands in for the Authorization header when
// it was signed for exactly this path and these query values.
const acceptLink = (req, res, next) => {
  const token = req.query.dl;
  if (!token) return next();

  res.json = function htmlInstead(body) {
    return this.type("html").send(page(body?.message || "حصل خطأ في التنزيل."));
  };

  try {
    const signed = jwt.verify(String(token), secret());
    const { dl, ...asked } = req.query;
    const keys = Object.keys(signed.query || {});
    const same =
      signed.path === req.path &&
      Object.keys(asked).length === keys.length &&
      keys.every((key) => asked[key] === signed.query[key]);
    if (!same) throw new Error("not this request");
    req.linkUserId = signed.userId;
    return next();
  } catch {
    return res.status(401).json({
      message: "رابط التنزيل ده انتهى. ارجع للتطبيق ودوس «نزّل السجل» تاني.",
    });
  }
};

// A file name the browser saves under: no path or quote characters, and
// the extension it must have.
const downloadName = (name, extension) => {
  const clean = String(name || "").replace(/[\\/:*?"<>|\r\n]/g, "").trim().slice(0, 80);
  if (!clean) return "";
  return clean.toLowerCase().endsWith(extension) ? clean : `${clean}${extension}`;
};

module.exports = { signLink, acceptLink, downloadName };
