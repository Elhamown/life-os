// Disposable, local-only test database. Never imported by the production application.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createHash, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const db = await PGlite.create();
await db.exec(
  await readFile(new URL("./private-store.sql", import.meta.url), "utf8"),
);
const session = "d".repeat(64);
await db.query(
  "INSERT INTO madar_private_sessions(id_hash,expires_at) VALUES($1,NOW()+INTERVAL '2 hours')",
  [createHash("sha256").update(session).digest("hex")],
);
const server = new PGLiteSocketServer({
  db,
  host: "127.0.0.1",
  port: 55431,
  maxConnections: 20,
});
await server.start();
const env = { ...process.env };
for (const key of Object.keys(env))
  if (key.startsWith("NOTION_") || key.startsWith("MADAR_")) env[key] = "";
Object.assign(env, {
  NOTION_DISCOVERY_TOKEN: "",
  NOTION_DISCOVERY_READ_ONLY_ACK: "",
  NOTION_SYNC_TOKEN: "",
  NOTION_SYNC_WRITE_ACK: "",
  NOTION_SYNC_TEST_ACK: "",
  NOTION_SYNC_TEST_SOURCE_IDS: "",
  NOTION_SYNC_WRITE_SOURCE_IDS: "",
  MADAR_AI_API_KEY: "",
  MADAR_AI_EXTERNAL_PROCESSING_ACK: "",
});
const salt = Buffer.alloc(32, 5);
Object.assign(env, {
  MADAR_APP_ORIGIN: "http://localhost:3100",
  MADAR_OWNER_PASSWORD_HASH: `scrypt$32768$8$1$${salt.toString("hex")}$${scryptSync("fixture-owner-password", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`,
  MADAR_SESSION_SECRET: "a".repeat(64),
  MADAR_STORE_ENCRYPTION_KEY: "b".repeat(64),
  DATABASE_URL: "postgresql://postgres:fixture@127.0.0.1:55431/postgres",
});
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    "3100",
  ],
  { env, stdio: "inherit" },
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", (code) => {
  if (!closing) {
    void close();
    process.exitCode = code ?? 1;
  }
});
