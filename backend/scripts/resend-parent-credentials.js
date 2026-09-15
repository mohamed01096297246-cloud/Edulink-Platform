// Re-issues a parent's login credentials and mails them, for the cases the
// normal registration flow can't cover:
//
//   * the credentials email failed when the account was first created (a
//     revoked Gmail app password did exactly this, silently, for a while)
//   * the parent already existed when their next child was registered, so
//     no email was sent — correct behaviour for a sibling, but it means a
//     parent whose FIRST email never arrived has no second chance
//   * the parent lost the email
//
// The stored password is hashed and cannot be read back, so "resend" always
// means "issue a new one". The new password is written ONLY after the mail
// is accepted — otherwise a send failure would lock the parent out of an
// account whose password nobody can tell them.
//
// Usage:
//   node scripts/resend-parent-credentials.js 01064771002 [more usernames...]
//   node scripts/resend-parent-credentials.js --since 2026-09-14
//   ...add --dry-run to list who would be mailed without touching anything.
require("dotenv").config();
const mongoose = require("mongoose");

const Student = require("../src/models/Student");
const User = require("../src/models/User");
const { generatePassword } = require("../src/utils/generateCredentials");
const { sendCredentialsEmail } = require("../src/utils/emailService");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const sinceIndex = args.indexOf("--since");
const since = sinceIndex !== -1 ? args[sinceIndex + 1] : null;
const usernames = args.filter(
  // Guard the sinceIndex === -1 case explicitly: -1 + 1 is 0, which would
  // silently swallow the first username when --since isn't used at all.
  (a, i) => !a.startsWith("--") && !(sinceIndex !== -1 && i === sinceIndex + 1),
);

const run = async () => {
  if (!since && usernames.length === 0) {
    console.error(
      "usage: node scripts/resend-parent-credentials.js <username...> | --since YYYY-MM-DD [--dry-run]",
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const filter = { role: "parent" };
  if (since) {
    const from = new Date(since);
    if (Number.isNaN(from.getTime())) {
      console.error(`--since is not a valid date: ${since}`);
      process.exit(1);
    }
    filter.createdAt = { $gte: from };
  } else {
    filter.username = { $in: usernames };
  }

  const parents = await User.find(filter).sort({ createdAt: 1 });

  if (parents.length === 0) {
    console.log("no matching parent accounts.");
    await mongoose.disconnect();
    return;
  }

  console.log(`matched ${parents.length} parent account(s)${DRY_RUN ? " (dry run)" : ""}\n`);

  let sent = 0;
  const failures = [];

  for (const parent of parents) {
    const fullName = `${parent.firstName} ${parent.lastName}`;

    if (!parent.email) {
      failures.push(`${fullName} (${parent.username}) — no email on record`);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop -- sequential on purpose so
    // each parent's outcome is reported honestly rather than as one blur.
    const children = await Student.find({ parent: parent._id }).select("firstName lastName");
    const childNames = children.map((c) => `${c.firstName} ${c.lastName}`).join("، ");

    if (DRY_RUN) {
      console.log(`[dry-run] ${parent.username} | ${fullName} -> ${parent.email} | ${childNames || "(no children)"}`);
      continue;
    }

    const newPassword = generatePassword();

    try {
      // eslint-disable-next-line no-await-in-loop
      await sendCredentialsEmail(
        parent.email,
        parent.username,
        newPassword,
        "Parent",
        fullName,
        childNames,
      );

      parent.password = newPassword;
      // eslint-disable-next-line no-await-in-loop
      await parent.save(); // pre("save") hashes it

      sent += 1;
      console.log(`sent: ${parent.username} | ${fullName} | ${childNames}`);
    } catch (err) {
      failures.push(`${fullName} (${parent.username}) — ${err.message.split("\n")[0]}`);
    }
  }

  if (!DRY_RUN) {
    console.log(`\nemails sent: ${sent}`);
    console.log(`failures: ${failures.length}`);
    for (const f of failures) console.log(`  ${f}`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("resend failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
