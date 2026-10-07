// Slows down password guessing. Usernames here are short — a six-digit
// code or a phone number — so without a limit anyone could try passwords
// against one account all day.
//
// Two counters of failed attempts in a sliding 15-minute window:
//   per account + address — 10, so one person's typos lock only themselves
//     (a whole school shares one address on its Wi-Fi);
//   per account, any address — 30, so spreading the guessing over many
//     addresses doesn't get around it.
// A successful sign-in clears that account's counters. Held in memory: each
// server instance counts on its own, which still caps guessing at a few
// dozen tries per quarter hour.
const WINDOW_MS = 15 * 60 * 1000;
const PER_ADDRESS = 10;
const PER_ACCOUNT = 30;

const failures = new Map(); // key → [timestamps]

const recent = (key, now) => {
  const list = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
};

const keysFor = (account, address) => [`a:${account}`, `a:${account}|${address}`];

// Minutes until the caller may try again, or 0 when they may try now.
const lockedFor = (account, address, now = Date.now()) => {
  const [acc, accAddr] = keysFor(account, address);
  const a = recent(acc, now);
  const b = recent(accAddr, now);
  const blocking = b.length >= PER_ADDRESS ? b : a.length >= PER_ACCOUNT ? a : null;
  if (!blocking) return 0;
  return Math.max(1, Math.ceil((WINDOW_MS - (now - blocking[0])) / 60000));
};

const recordFailure = (account, address, now = Date.now()) => {
  for (const key of keysFor(account, address)) failures.set(key, [...recent(key, now), now]);
};

const clear = (account) => {
  for (const key of [...failures.keys()]) if (key === `a:${account}` || key.startsWith(`a:${account}|`)) failures.delete(key);
};

// Keeps the map from growing without bound on a long-running server.
setInterval(() => {
  const now = Date.now();
  for (const key of [...failures.keys()]) recent(key, now);
}, WINDOW_MS).unref();

module.exports = { lockedFor, recordFailure, clear, PER_ADDRESS, PER_ACCOUNT, _failures: failures };
