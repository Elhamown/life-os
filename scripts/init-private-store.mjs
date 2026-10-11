import { readFile } from "node:fs/promises";
import postgres from "postgres";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Set DATABASE_URL securely before initializing the internal MADAR store.",
  );
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => undefined,
});
try {
  await sql.unsafe(
    await readFile(new URL("./private-store.sql", import.meta.url), "utf8"),
  );
  console.log("Internal MADAR tables initialized. No Notion requests made.");
} catch {
  console.error(
    "Internal store initialization failed. Check the database connection securely.",
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
