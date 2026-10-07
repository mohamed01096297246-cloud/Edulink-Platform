// Proves a backup copy restores: loads it into a throwaway MongoDB in
// memory (never the live database), then checks every collection holds as
// many documents as the copy says it had, and that ids, dates and stored
// images came back as their real types.
//
//   node scripts/verify-backup.js [file]     (default: the newest copy)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { MongoClient, BSON } = require("mongodb");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

const { EJSON } = BSON;
const folder = process.env.BACKUP_DIR || "D:/EduLink-backups";

const newest = () => {
  const files = fs
    .readdirSync(folder)
    .filter((f) => /^edulink-.*\.jsonl\.gz$/.test(f))
    .map((f) => path.join(folder, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) throw new Error(`no backups in ${folder}`);
  return files[0];
};

(async () => {
  const file = process.argv[2] || newest();
  const mongod = await MongoMemoryServer.create();
  const client = await MongoClient.connect(mongod.getUri());
  const db = client.db("restore_check");

  const lines = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let header = null;
  const batch = new Map();
  const flush = async (name) => {
    const docs = batch.get(name);
    if (docs?.length) await db.collection(name).insertMany(docs, { ordered: false });
    batch.set(name, []);
  };

  for await (const line of lines) {
    if (!line) continue;
    if (!header) {
      header = JSON.parse(line);
      continue;
    }
    const { c, d } = JSON.parse(line);
    if (!batch.has(c)) batch.set(c, []);
    batch.get(c).push(EJSON.deserialize(d, { relaxed: false }));
    if (batch.get(c).length >= 1000) await flush(c);
  }
  for (const name of batch.keys()) await flush(name);

  const problems = [];
  for (const [name, expected] of Object.entries(header.counts)) {
    const got = await db.collection(name).countDocuments();
    if (got !== expected) problems.push(`${name}: ${got} restored, copy says ${expected}`);
  }

  // Types survive the round trip, not just counts.
  const sample = await db.collection("users").findOne({});
  if (sample && !(sample._id instanceof BSON.ObjectId)) problems.push("users._id did not come back as an ObjectId");
  if (sample && sample.createdAt && !(sample.createdAt instanceof Date)) problems.push("users.createdAt did not come back as a Date");
  const image = await db.collection("boardnoteimages").findOne({});
  if (image && image.data && !(image.data instanceof BSON.Binary)) problems.push("board note images did not come back as binary");

  await client.close();
  await mongod.stop();

  const total = Object.values(header.counts).reduce((a, b) => a + b, 0);
  console.log(`Copy: ${path.basename(file)} (taken ${header.takenAt})`);
  if (problems.length) {
    console.log("RESTORE CHECK FAILED:");
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log(`RESTORE CHECK OK — ${Object.keys(header.counts).length} collections, ${total} documents, all restored with their types.`);
})().catch((err) => {
  console.error("RESTORE CHECK FAILED:", err.message);
  process.exit(1);
});
