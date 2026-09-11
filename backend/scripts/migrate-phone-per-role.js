// Swaps User's plain unique index on phoneNumber for a compound
// { phoneNumber, role } unique index — a phone number now identifies a
// real person, and a real person may legitimately need two accounts here
// (a teacher whose own child attends the school also needs a parent
// account). Uniqueness moves from "this phone, period" to "this phone as
// this role", which is what actually needs to stay one-of-a-kind.
//
// Safe to run repeatedly: checks the current index shape before touching
// it, and refuses to create the new index if doing so would silently paper
// over a real duplicate (two accounts of the *same* role already sharing a
// phone — shouldn't exist, but checked rather than assumed).
require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  const existing = await users.indexes();
  const old = existing.find(
    (i) => i.key && i.key.phoneNumber === 1 && Object.keys(i.key).length === 1,
  );

  if (old) {
    await users.dropIndex(old.name);
    console.log(`dropped plain unique index: ${old.name}`);
  } else {
    console.log("no plain unique index on phoneNumber found");
  }

  const hasCompound = (await users.indexes()).some(
    (i) => i.key && i.key.phoneNumber === 1 && i.key.role === 1,
  );

  if (!hasCompound) {
    // Would throw on a real same-role duplicate rather than silently
    // succeed — exactly the point: that needs a human decision, not a
    // migration guessing which account is the real one.
    await users.createIndex({ phoneNumber: 1, role: 1 }, { unique: true });
    console.log("created compound unique index: phoneNumber_1_role_1");
  } else {
    console.log("compound index on phoneNumber+role already present");
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
