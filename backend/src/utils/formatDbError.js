// Turns a raw MongoDB duplicate-key error (E11000 ...) into a readable
// Arabic message naming the actual field that collided, instead of the raw
// driver message leaking straight to the UI. Returns null for anything
// that isn't a duplicate-key error, so callers can fall back to their own
// handling.
const FIELD_LABELS = {
  phoneNumber: "رقم الهاتف",
  nationalId: "الرقم القومي",
  username: "اسم المستخدم",
  email: "البريد الإلكتروني",
};

function friendlyDuplicateKeyMessage(err) {
  if (!err || err.code !== 11000) {
    return null;
  }

  const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
  const value = err.keyValue ? err.keyValue[field] : undefined;
  const label = FIELD_LABELS[field] || field || "بيانات";

  return `عذرًا، ${label}${value ? ` (${value})` : ""} مسجّل بالفعل لحساب آخر.`;
}

module.exports = { friendlyDuplicateKeyMessage };
