// Fail-closed source/build checks; no credentials, integrations or databases are accessed.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) {
  const all = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) all.push(...(await files(path)));
    else all.push(path);
  }
  return all;
}
const failures = [];
const forbidden =
  /NOTION_(?:DISCOVERY_TOKEN|SYNC_TOKEN)|MADAR_(?:AI_API_KEY|OWNER_PASSWORD_HASH|SESSION_SECRET|STORE_ENCRYPTION_KEY)|DATABASE_URL|@notionhq/;
const privatePages = new Map([
  ["app/page.tsx", "/"],
  ["app/discovery/page.tsx", "/discovery"],
  ["app/sync/page.tsx", "/sync"],
]);
const apiRoutes = new Set([
  "app/api/private/[action]/route.ts",
  "app/api/notion/[action]/route.ts",
  "app/api/ai/[action]/route.ts",
  "app/api/sync/[action]/route.ts",
]);
for (const path of await files("app")) {
  const text = await readFile(path, "utf8");
  if (
    path.endsWith("/page.tsx") &&
    !privatePages.has(path) &&
    path !== "app/login/page.tsx"
  )
    failures.push(`Unreviewed page exposure: ${path}`);
  if (path.endsWith("/route.ts") && !apiRoutes.has(path))
    failures.push(`Unreviewed API exposure: ${path}`);
  if (
    privatePages.has(path) &&
    !text.includes(`await requirePageSession("${privatePages.get(path)}")`)
  )
    failures.push(`Page authentication missing: ${path}`);
  if (/^['"]use client['"];/.test(text.trimStart()) && forbidden.test(text))
    failures.push(
      `Server credential/SDK reference in client component: ${path}`,
    );
}
for (const path of await files(".next/static")) {
  if (
    /\.(js|json|map)$/.test(path) &&
    forbidden.test(await readFile(path, "utf8"))
  )
    failures.push(
      `Server credential/SDK reference in browser artifact: ${path}`,
    );
}
for (const line of (await readFile(".env.example", "utf8")).split("\n")) {
  const [key, ...value] = line.split("=");
  if (forbidden.test(key) && value.join("=").trim())
    failures.push(`Nonempty credential example: ${key}`);
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else
  console.log(
    "PASS: reviewed owner-only route surface, protected pages, blank secret examples and browser/server separation.",
  );
