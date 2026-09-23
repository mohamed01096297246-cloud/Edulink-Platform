// Student accounts hold no phone number, so the old unique index on
// {phoneNumber, role} — which counted every missing value as the same one —
// would let exactly one student account exist in the whole system. This
// rebuilds it as a partial index covering only accounts that actually have
// a phone, which is what models/User.js now declares.
//
// Safe to re-run: it checks the live index first and does nothing if the
// partial version is already in place. Existing accounts are untouched —
// staff and parents all carry a phone, so the uniqueness they had before is
// exactly the uniqueness they keep.
//
// Usage: node scripts/migrate-student-index.js [--dry-run]
require("dotenv").config();
const mongoose = require("mongoose");

const NAME = "phoneNumber_1_role_1";

const run = async () => {
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  const before = await users.indexes();
  const current = before.find((i) => i.name === NAME);
  console.log("current:", JSON.stringify(current || null));

  if (current?.partialFilterExpression) {
    console.log("already partial — nothing to do");
    await mongoose.disconnect();
    return;
  }

  // A student account created before this ran would have blocked the
  // rebuild; report any duplicate-phone clash rather than failing opaquely.
  const clashes = await users
    .aggregate([
      { $match: { phoneNumber: { $type: "string" } } },
      { $group: { _id: { phoneNumber: "$phoneNumber", role: "$role" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  if (clashes.length) {
    console.error("cannot rebuild — these phone/role pairs are duplicated:");
    clashes.forEach((c) => console.error(`  ${c._id.phoneNumber} (${c._id.role}) ×${c.n}`));
    process.exit(1);
  }

  if (dryRun) {
    console.log("dry run — would drop and recreate as partial");
    await mongoose.disconnect();
    return;
  }

  if (current) await users.dropIndex(NAME);
  await users.createIndex(
    { phoneNumber: 1, role: 1 },
    { unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } }, name: NAME },
  );

  console.log(
    "after:",
    JSON.stringify((await users.indexes()).find((i) => i.name === NAME)),
  );
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("migration failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
