// Folds away the spelling variance that makes two independently-typed
// Arabic name lists hard to match against each other — hamza/alef forms,
// diacritics, ta-marbuta vs ha, and stray whitespace. Used both when
// importing the contact directory and when searching it, so a query typed
// with a plain alef still finds a stored hamza-on-alef.
const normalizeArabicName = (name) =>
  String(name || "")
    .replace(/[ً-ٰٟـ]/g, "") // diacritics + tatweel
    .replace(/[إأآا]/g, "ا") // إ أ آ ا -> ا
    .replace(/ى/g, "ي") // ى -> ي
    .replace(/ؤ/g, "و") // ؤ -> و
    .replace(/ئ/g, "ي") // ئ -> ي
    .replace(/ة/g, "ه") // ة -> ه
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

module.exports = { normalizeArabicName };
