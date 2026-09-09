// Swaps User's plain unique index on nationalId for a partial one that only
// applies where the field actually exists — a plain unique index treats
// every missing value as the same null and would let only one parent ever
// register without a national ID before every later one failed with a
// duplicate-key error.
//
// Safe to run repeatedly: checks the current index shape before touching it.
require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  const existing = await users.indexes();
  const old = existing.find(
    (i) => i.key && i.key.nationalId === 1 && !i.partialFilterExpression,
  );

  if (old) {
    await users.dropIndex(old.name);
    console.log(`dropped plain unique index: ${old.name}`);
  } else {
    console.log("no plain unique index on nationalId found");
  }

  const hasPartial = (await users.indexes()).some(
    (i) => i.key && i.key.nationalId === 1 && i.partialFilterExpression,
  );

  if (!hasPartial) {
    // A pre-existing duplicate would make this throw rather than silently
    // skip — exactly the point: two staff accounts sharing a real national
    // ID need a human decision, not a migration guessing which one is right.
    await users.createIndex(
      { nationalId: 1 },
      { unique: true, partialFilterExpression: { nationalId: { $type: "string" } } },
    );
    console.log("created partial unique index on nationalId");
  } else {
    console.log("partial unique index on nationalId already present");
  }

  console.log("\nfinal user indexes:");
  (await users.indexes()).forEach((i) => console.log(`  ${i.name}`));

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("migration failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
