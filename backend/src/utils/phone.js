// Phone numbers reach us typed by hand — into a registration form on an
// Arabic keyboard, or into a school's own spreadsheet — so the same number
// turns up as "٠١٠٠...", "010...", "10..." (Excel dropped the leading zero
// of a number it stored as a number) or "+2010...". Everything that
// compares or stores a phone goes through here first, so one family's
// number is always one string.

// ٠-٩ (Arabic-Indic) and ۰-۹ (Persian, what some Windows keyboards emit)
// to 0-9. Leaves every other character alone.
const toLatinDigits = (value) =>
  String(value ?? "").replace(/[٠-٩۰-۹]/g, (d) =>
    String(d.charCodeAt(0) & 0xf),
  );

// An Egyptian mobile: 010 / 011 / 012 / 015 followed by 8 digits.
const EGYPT_MOBILE = /^01[0125]\d{8}$/;

// One run of digits to the canonical 11-digit form, or null when it can't
// be read as a mobile number with confidence (a digit short, a digit too
// many — those are typos only the family can fix, never guessed at).
const canonicalMobile = (digits) => {
  let d = digits;
  if (d.startsWith("0020")) d = d.slice(3);
  else if (d.startsWith("20") && d.length === 12) d = d.slice(1);
  if (d.length === 10 && d.startsWith("1")) d = `0${d}`;
  return EGYPT_MOBILE.test(d) ? d : null;
};

// Every mobile number written in one free-text cell ("01005472699
// 01008581862", "01067978296/ 01014732618", a bare number Excel kept as
// an integer). `valid` keeps the order they were written in, without
// repeats; `invalid` keeps the unreadable ones as written, so a person can
// still see and fix them.
const extractMobiles = (value) => {
  const valid = [];
  const invalid = [];
  const runs = toLatinDigits(value).match(/\d+/g) || [];

  for (const run of runs) {
    const phone = canonicalMobile(run);
    if (phone) {
      if (!valid.includes(phone)) valid.push(phone);
    } else if (run.length >= 7) {
      invalid.push(run);
    }
  }

  return { valid, invalid };
};

module.exports = { toLatinDigits, canonicalMobile, extractMobiles, EGYPT_MOBILE };
