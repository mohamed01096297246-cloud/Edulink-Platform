// A full copy of the live database, written to one compressed file.
//
//   node scripts/backup.js [folder]
//
// The folder defaults to BACKUP_DIR or D:/EduLink-backups. Each run writes
// edulink-YYYY-MM-DD_HHMM.jsonl.gz: a first line describing the copy (time,
// and how many documents each collection had), then one line per document,
// in Extended JSON so ids, dates and stored images come back exactly.
// Copies older than KEEP_DAYS are removed, but the newest MIN_KEEP are always
// kept, so a machine that was off for a month still has something.
//
// Read only: nothing in the database is changed. scripts/verify-backup.js
// proves a copy restores.
require("dotenv").config({ quiet: true, path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const mongoose = require("mongoose");

const { EJSON } = mongoose.mongo.BSON;
const KEEP_DAYS = 30;
const MIN_KEEP = 7;

const folder = process.argv[2] || process.env.BACKUP_DIR || "D:/EduLink-backups";

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

const prune = () => {
  const files = fs
    .readdirSync(folder)
    .filter((f) => /^edulink-.*\.jsonl\.gz$/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(folder, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  const removed = files.slice(MIN_KEEP).filter((x) => x.t < cutoff);
  removed.forEach((x) => fs.unlinkSync(path.join(folder, x.f)));
  return { kept: files.length - removed.length, removed: removed.length };
};

(async () => {
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `edulink-${stamp()}.jsonl.gz`);
  const partial = `${file}.partial`;

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."))
    .sort();

  const counts = {};
  for (const n of names) counts[n] = await db.collection(n).countDocuments();

  const gzip = zlib.createGzip({ level: 9 });
  const out = fs.createWriteStream(partial);
  gzip.pipe(out);
  const write = (line) =>
    new Promise((resolve) => (gzip.write(`${line}\n`) ? resolve() : gzip.once("drain", resolve)));

  await write(JSON.stringify({ edulinkBackup: 1, database: db.databaseName, takenAt: new Date().toISOString(), counts }));

  let written = 0;
  for (const n of names) {
    for await (const doc of db.collection(n).find({})) {
      await write(JSON.stringify({ c: n, d: EJSON.serialize(doc, { relaxed: false }) }));
      written += 1;
    }
  }

  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
    gzip.end();
  });
  await mongoose.disconnect();
  fs.renameSync(partial, file);

  const expected = Object.values(counts).reduce((a, b) => a + b, 0);
  const { kept, removed } = prune();
  const mb = (fs.statSync(file).size / 1048576).toFixed(1);
  console.log(`Backup written: ${file}`);
  console.log(`  ${names.length} collections, ${written} documents (expected ${expected}), ${mb} MB`);
  console.log(`  copies kept: ${kept}${removed ? `, removed ${removed} older than ${KEEP_DAYS} days` : ""}`);
  if (written < expected) {
    console.error("WARNING: fewer documents written than counted — documents may have been added during the copy.");
  }
})().catch(async (err) => {
  console.error("BACKUP FAILED:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
