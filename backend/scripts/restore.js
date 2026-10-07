// Emergency use only: puts a backup copy back into a database.
//
//   node scripts/restore.js <copy.jsonl.gz> --to "<mongodb uri>" --database <name> --confirm
//
// It refuses to write into a database that already holds any documents, so
// it can never overwrite or mix into live data. To recover, restore into a
// new, empty database, check it, then point the server's MONGO_URI at it.
const fs = require("fs");
const zlib = require("zlib");
const readline = require("readline");
const { MongoClient, BSON } = require("mongodb");

const { EJSON } = BSON;
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

(async () => {
  const file = args[0];
  const uri = opt("--to");
  const dbName = opt("--database");
  if (!file || !uri || !dbName || !args.includes("--confirm")) {
    console.log('Usage: node scripts/restore.js <copy.jsonl.gz> --to "<mongodb uri>" --database <name> --confirm');
    process.exit(2);
  }

  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if ((await db.collection(c.name).estimatedDocumentCount()) > 0) {
      console.error(`REFUSED: database "${dbName}" already has data (${c.name}). Restore into an empty database.`);
      await client.close();
      process.exit(1);
    }
  }

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

  let ok = true;
  for (const [name, expected] of Object.entries(header.counts)) {
    const got = await db.collection(name).countDocuments();
    if (got !== expected) {
      ok = false;
      console.error(`  ${name}: ${got} restored, copy says ${expected}`);
    }
  }
  await client.close();
  console.log(ok ? `Restored ${file} (taken ${header.takenAt}) into "${dbName}". Indexes are rebuilt by the server on start.` : "RESTORE INCOMPLETE — see above.");
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error("RESTORE FAILED:", err.message);
  process.exit(1);
});
