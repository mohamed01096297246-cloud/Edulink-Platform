// Login credentials are mailed out through a Gmail account (see
// emailService.js), and a mistyped address means the teacher never gets
// their username and password with no error shown anywhere. Restricting the
// address to a real gmail.com one keeps the common typo — a made-up or
// placeholder domain — from silently swallowing an account's only copy of
// its credentials.
const GMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@gmail\.com$/i;

const isGmailAddress = (value) =>
  typeof value === "string" && GMAIL_RE.test(value.trim());

const GMAIL_REQUIRED_MESSAGE =
  "البريد الإلكتروني لازم يكون حساب Gmail صحيح (ينتهي بـ @gmail.com).";

module.exports = { isGmailAddress, GMAIL_REQUIRED_MESSAGE };
