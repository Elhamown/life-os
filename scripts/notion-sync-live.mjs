// Explicit disposable test only. No audit bypass, schema changes, cleanup, or writes to existing-mode sources.
import { randomUUID } from "node:crypto";
const origin = process.env.MADAR_SYNC_VERIFY_ORIGIN;
const password = process.env.MADAR_SYNC_VERIFY_PASSWORD;
const sourceId = process.env.MADAR_SYNC_VERIFY_SOURCE_ID;
if (
  process.argv.slice(2).join(" ") !== "--execute-disposable-test" ||
  process.env.MADAR_SYNC_LIVE_TEST_ACK !== "1" ||
  !origin ||
  !password ||
  !sourceId
)
  throw Error(
    "Review docs/notion-sync.md; configure verification values securely and explicitly opt in with --execute-disposable-test. Never put secrets in arguments or chat.",
  );
const url = new URL(origin);
if (
  url.origin !== origin ||
  (url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname))
)
  throw Error("Use the exact authenticated HTTPS site origin.");
let cookie = "";
async function call(path, body) {
  const r = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(`Verification stopped safely: ${data.error || r.status}`);
  return { r, data };
}
try {
  const login = await call("/api/private/login", { password });
  cookie = login.r.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) throw Error("Private authentication failed.");
  const { data: status } = await call("/api/sync/status");
  const source = status.sources.find(
    (s) => s.id.replace(/-/g, "") === sourceId.replace(/-/g, "").toLowerCase(),
  );
  const scope = status.ledger.scopes.find((s) => s.sourceId === source?.id);
  if (
    !status.configured ||
    !source ||
    source.mode !== "test" ||
    !scope ||
    scope.mode !== "test"
  )
    throw Error(
      "Only a separately approved disposable test-mode source is permitted. Audit, mapping and column scope must already be approved in the site.",
    );
  const recordId = randomUUID();
  const fields = {
    title: "اختبار مدار · تحقق التكامل القابل للتخلص منه",
    details: null,
    date: null,
    kind: "note",
    durationMinutes: null,
  };
  console.log(
    "Disposable test authorized for source",
    source.id,
    "stable record",
    recordId,
    "fields",
    JSON.stringify(fields),
  );
  const prepared = await call("/api/sync/prepare", {
    sourceId: source.id,
    recordId,
    operation: "create",
    origin: "manual",
    fields,
  });
  let action = prepared.data.action;
  if (action.state !== "pending")
    throw Error(
      "Creation preview is not safe/pending; inspect the private history.",
    );
  console.log(
    "Exact create target/payload:",
    JSON.stringify({
      sourceId: action.sourceId,
      payload: action.payload,
      digest: action.digest,
    }),
  );
  const created = await call("/api/sync/execute", {
    id: action.id,
    version: action.version,
    digest: action.digest,
    approved: true,
  });
  action = created.data.action;
  if (action.state !== "succeeded")
    throw Error(
      "Create is not verified. Do not retry ambiguous creation; use read-only reconciliation in the site.",
    );
  const repeated = await call("/api/sync/execute", {
    id: action.id,
    version: action.version,
    digest: action.digest,
    approved: true,
  });
  if (
    repeated.data.action.pageId !== action.pageId ||
    repeated.data.action.attempts !== action.attempts
  )
    throw Error("Idempotent repeat verification failed.");
  const updatePreview = await call("/api/sync/prepare", {
    sourceId: source.id,
    recordId,
    pageId: action.pageId,
    operation: "update",
    origin: "manual",
    fields: { ...fields, title: "اختبار مدار · تحقق التحديث مع حفظ المعرّف" },
  });
  const update = updatePreview.data.action;
  if (update.state !== "pending")
    throw Error("Update preview conflicts; inspect the site.");
  console.log(
    "Exact disposable update target/payload:",
    JSON.stringify({
      sourceId: update.sourceId,
      pageId: update.pageId,
      payload: update.payload,
      digest: update.digest,
    }),
  );
  const changed = await call("/api/sync/execute", {
    id: update.id,
    version: update.version,
    digest: update.digest,
    approved: true,
    riskAccepted: true,
  });
  if (
    changed.data.action.state !== "succeeded" ||
    changed.data.action.pageId !== action.pageId
  )
    throw Error(
      "Update not verified; review the journal without repeating uncertain writes.",
    );
  const final = await call("/api/sync/status");
  if (
    !final.data.testPassed ||
    final.data.ledger.testEvidence?.sourceId !== source.id
  )
    throw Error(
      "The server did not issue test evidence. Existing sources remain locked.",
    );
  console.log(
    "Disposable create/update and repeat verification passed. The demo record remains in Notion; no cleanup/archive/delete performed. Review and approve existing sources separately.",
  );
} finally {
  if (cookie) {
    try {
      await call("/api/private/logout", {});
    } catch {
      /* No credentials printed. Session also expires. */
    }
  }
  cookie = "";
}
