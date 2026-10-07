// Every test file runs against its own throwaway MongoDB in memory — never
// the real database. Started before the file's tests, wiped between tests,
// and stopped afterwards.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-for-production";
process.env.NODE_ENV = "test";
// Set before app.js loads dotenv (which never overrides a variable already
// set), so nothing a test runs can ever reach the real database.
process.env.MONGO_URI = "mongodb://127.0.0.1:1/never-the-real-database";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server-core");

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
