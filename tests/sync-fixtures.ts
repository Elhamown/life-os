import { randomUUID } from "node:crypto";
import { createSyncGateway } from "../app/lib/sync/gateway";
import { syncConfig, uuid } from "../app/lib/sync/validation";
import { digest, issueToken, cookieName } from "../app/lib/private/crypto";
import type { Store } from "../app/lib/private/store";
import { SqlStore, type QueryExecutor } from "../app/lib/private/store";
import { syncApi, type SyncContext } from "../app/lib/sync/api";
import type { AuditEntry } from "../app/lib/notion/types";
import type { PrivateConfig } from "../app/lib/private/config";
export const testSource = "00000000-0000-4000-8000-000000000001",
  realSource = "00000000-0000-4000-8000-000000000002";
export const columns = {
  title: "title",
  recordId: "stable",
  details: "details",
  date: "date",
  kind: "kind",
  duration: "duration",
};
export const schema = (id: string) => ({
  object: "data_source",
  id,
  properties: {
    Name: { id: "title", name: "Name", type: "title", title: {} },
    Stable: { id: "stable", name: "Stable", type: "rich_text", rich_text: {} },
    Details: {
      id: "details",
      name: "Details",
      type: "rich_text",
      rich_text: {},
    },
    Date: { id: "date", name: "Date", type: "date", date: {} },
    Kind: { id: "kind", name: "Kind", type: "rich_text", rich_text: {} },
    Duration: {
      id: "duration",
      name: "Duration",
      type: "number",
      number: { format: "number" },
    },
  },
});
export const fields = {
  title: "اختبار مدار · سجل تجريبي",
  details: null,
  date: null,
  kind: "note",
  durationMinutes: null,
};
export type FakePage = {
  object: string;
  id: string;
  parent: { type: string; data_source_id: string };
  last_edited_time: string;
  in_trash: boolean;
  properties: Record<string, Record<string, unknown>>;
};
export async function syncFixture(sql = false) {
  const state = new Map<string, unknown>(),
    logs: unknown[] = [],
    pages = new Map<string, FakePage>();
  let clock = 0,
    lease: string | null = null,
    calls = 0,
    failAudit = false,
    sessionActive = true;
  let db: import("@electric-sql/pglite").PGlite | undefined;
  let unknownCreate = false,
    readFailureAfterCreate = false,
    pendingReadFailure = false,
    unknownUpdate = false,
    rateLimit = false,
    incomplete = false,
    schemaChanged = false,
    postWriteConflict = false,
    denied = false,
    failPersistAfterWrite = false;
  const requests: {
    method: string;
    path: string;
    body: unknown;
    version: string | null;
  }[] = [];
  const cfg: PrivateConfig = {
    origin: "https://madar.example",
    passwordHash: "unused",
    sessionSecret: "a".repeat(64),
    encryptionKey: "b".repeat(64),
    databaseUrl: "fixture",
    notionToken: "fake-audit-token",
    readOnlyAcknowledged: true,
    secureCookies: true,
  };
  let store: Store = {
    async get<T>(key: string) {
      return structuredClone(state.get(key) ?? null) as T | null;
    },
    async put(key, value) {
      state.set(key, structuredClone(value));
    },
    async putUnderLease(key, value, id) {
      if (id !== lease) return false;
      state.set(key, structuredClone(value));
      return true;
    },
    async putAudited(key, value, event, count, id) {
      if (
        failAudit ||
        id !== lease ||
        (failPersistAfterWrite &&
          requests.some((r) => r.path === "/v1/pages" && r.method === "POST"))
      )
        throw Error("private-store-error");
      state.set(key, structuredClone(value));
      logs.push({ event, count, outcome: "ok" });
    },
    async session(id) {
      return sessionActive && id === digest("c".repeat(64));
    },
    async createSession() {},
    async revokeSession() {
      sessionActive = false;
    },
    async consume() {
      return ++calls <= 30;
    },
    async lease(_key, id) {
      if (lease) return false;
      lease = id;
      return true;
    },
    async release(_key, id) {
      if (lease === id) lease = null;
    },
    async audit(event, outcome, count = 0) {
      if (failAudit) throw Error("private-audit-secret");
      logs.push({ event, outcome, count });
    },
    async logs() {
      return logs as AuditEntry[];
    },
  };
  if (sql) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFile } = await import("node:fs/promises");
    db = new PGlite();
    await db.exec(
      await readFile(
        new URL("../scripts/private-store.sql", import.meta.url),
        "utf8",
      ),
    );
    const actual = db;
    const q: QueryExecutor = {
      async query<T extends Record<string, unknown>>(
        query: string,
        values: unknown[] = [],
      ) {
        return (await actual.query<T>(query, values)).rows;
      },
    };
    store = new SqlStore(q, cfg.encryptionKey);
    await store.createSession(
      digest("c".repeat(64)),
      new Date(Date.now() + 1800000).toISOString(),
    );
  }
  const bodyProperties = (
    payload: Record<string, unknown>,
    previous: Record<string, Record<string, unknown>> = {},
  ) => {
    const result = structuredClone(previous);
    for (const [id, v] of Object.entries(payload)) {
      const p = v as Record<string, unknown>;
      const type = Object.keys(p)[0];
      result[id] = { id, type, ...p };
    }
    for (const [id, type] of Object.entries({
      title: "title",
      stable: "rich_text",
      details: "rich_text",
      date: "date",
      kind: "rich_text",
      duration: "number",
    }))
      if (!result[id])
        result[id] = {
          id,
          type,
          [type]: ["title", "rich_text"].includes(type) ? [] : null,
        };
    return result;
  };
  const edited = () =>
    new Date(Date.UTC(2026, 9, 11, 0, 0, ++clock)).toISOString();
  const upstream: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = String(init?.method),
      body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({
      method,
      path: url.pathname,
      body,
      version: new Headers(init?.headers).get("notion-version"),
    });
    if (denied) return new Response("private-notion-error", { status: 403 });
    if (method === "GET" && url.pathname.includes("/data_sources/")) {
      const id = url.pathname.split("/").at(-1)!;
      const value = schema(id);
      if (schemaChanged) value.properties.Name.name = "Changed";
      return Response.json(value);
    }
    if (method === "POST" && url.pathname.endsWith("/query")) {
      const id = url.pathname.split("/")[3],
        recordId = body.filter.rich_text.equals;
      const matched = [...pages.values()].filter(
        (p) =>
          p.parent.data_source_id === id &&
          !p.in_trash &&
          (p.properties.stable.rich_text as { text: { content: string } }[])
            .map((v) => v.text.content)
            .join("") === recordId,
      );
      return Response.json({
        object: "list",
        type: "page_or_data_source",
        results: matched.slice(0, 2),
        has_more: matched.length > 2,
        next_cursor: matched.length > 2 ? "more" : null,
        ...(incomplete ? { request_status: { type: "incomplete" } } : {}),
      });
    }
    if (method === "GET" && url.pathname.includes("/pages/")) {
      if (pendingReadFailure) {
        pendingReadFailure = false;
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      const p = pages.get(url.pathname.split("/").at(-1)!);
      return p ? Response.json(p) : new Response("{}", { status: 404 });
    }
    if (method === "POST" && url.pathname === "/v1/pages") {
      if (rateLimit) {
        rateLimit = false;
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      const id = randomUUID();
      const page: FakePage = {
        object: "page",
        id,
        parent: {
          type: "data_source_id",
          data_source_id: body.parent.data_source_id,
        },
        last_edited_time: edited(),
        in_trash: false,
        properties: bodyProperties(body.properties),
      };
      pages.set(id, page);
      if (readFailureAfterCreate) {
        readFailureAfterCreate = false;
        pendingReadFailure = true;
      }
      if (unknownCreate) {
        unknownCreate = false;
        throw Error("network lost AFTER commit");
      }
      return Response.json(page);
    }
    if (method === "PATCH" && url.pathname.includes("/pages/")) {
      const p = pages.get(url.pathname.split("/").at(-1)!)!;
      p.properties = bodyProperties(body.properties, p.properties);
      p.last_edited_time = edited();
      if (postWriteConflict) {
        p.properties.title = {
          id: "title",
          type: "title",
          title: [{ type: "text", text: { content: "external conflict" } }],
        };
      }
      if (unknownUpdate) {
        unknownUpdate = false;
        throw Error("network lost AFTER update");
      }
      return Response.json(p);
    }
    throw Error("Unexpected endpoint");
  };
  const config = syncConfig({
    NOTION_SYNC_TOKEN: "fake-write-token",
    NOTION_SYNC_WRITE_ACK: "1",
    NOTION_SYNC_TEST_ACK: "1",
    NOTION_SYNC_TEST_SOURCE_IDS: testSource,
    NOTION_SYNC_WRITE_SOURCE_IDS: realSource,
  });
  const context: SyncContext = {
    config: cfg,
    store,
    sync: config,
    notion() {
      throw Error("Audit client cannot write");
    },
    gateway: (scope, action, approved) =>
      createSyncGateway(
        config.token!,
        scope,
        action,
        approved,
        upstream,
        async () => {},
      ),
  };
  const time = new Date().toISOString();
  await store.put("discovery", {
    id: "report",
    revision: 1,
    status: "complete",
    updatedAt: time,
    items: [testSource, realSource].map((id) => ({
      id,
      kind: "data_source",
      verified: true,
      title: "Disposable fixture",
      schema: [],
    })),
  });
  await store.put(
    "mappings",
    [testSource, realSource].map((sourceId) => ({
      sourceId,
      area: "life",
      aiIngestion: false,
      approvedAt: time,
      reportId: "report",
    })),
  );
  const cookie = `${cookieName(cfg)}=${await issueToken(cfg, "c".repeat(64))}`;
  const invoke = (
    name: string,
    body: unknown = {},
    options: { anonymous?: boolean; origin?: string; method?: string } = {},
  ) =>
    syncApi(
      new Request(`${cfg.origin}/api/sync/${name}`, {
        method: options.method ?? "POST",
        headers: {
          Origin: options.origin ?? cfg.origin,
          "Content-Type": "application/json",
          ...(options.anonymous ? {} : { Cookie: cookie }),
        },
        ...(options.method === "GET" ? {} : { body: JSON.stringify(body) }),
      }),
      name,
      context,
    );
  async function json(name: string, body: unknown = {}) {
    const r = await invoke(name, body);
    const result = await r.json();
    if (!r.ok) throw Error(`${r.status}:${JSON.stringify(result)}`);
    return result;
  }
  const scope = (sourceId = testSource) =>
    json("scope", {
      sourceId,
      columns,
      reportId: "report",
      revision: 1,
      approved: true,
      disposableConfirmed: true,
    });
  const prepare = (
    recordId = randomUUID(),
    values = fields,
    sourceId = testSource,
    operation = "create",
    pageId: string | null = null,
    extra: Record<string, unknown> = {},
  ) =>
    json("prepare", {
      sourceId,
      recordId,
      fields: values,
      operation,
      pageId,
      origin: "manual",
      ...extra,
    });
  const approve = (action: Record<string, unknown>, name = "execute") =>
    json(name, {
      id: action.id,
      version: action.version,
      digest: action.digest,
      approved: true,
      riskAccepted: true,
    });
  async function gate() {
    await scope();
    const { action } = await prepare();
    const created = (await approve(action)).action;
    const { action: update } = await prepare(
      created.recordId,
      { ...fields, title: "اختبار مدار · عنوان محدث" },
      testSource,
      "update",
      created.pageId,
    );
    const done = await approve(update);
    if (!done.ledger.testEvidence) throw Error(JSON.stringify(done));
    return { created, updated: done.action };
  }
  return {
    store,
    state,
    logs,
    db,
    pages,
    context,
    requests,
    upstream,
    cookie,
    invoke,
    json,
    scope,
    prepare,
    approve,
    gate,
    bodyProperties,
    edited,
    setUnknownCreate() {
      unknownCreate = true;
    },
    setReadFailureAfterCreate() {
      readFailureAfterCreate = true;
    },
    setUnknownUpdate() {
      unknownUpdate = true;
    },
    setRateLimit() {
      rateLimit = true;
    },
    setIncomplete() {
      incomplete = true;
    },
    setSchemaChanged() {
      schemaChanged = true;
    },
    setPostWriteConflict() {
      postWriteConflict = true;
    },
    setDenied() {
      denied = true;
    },
    setAuditFailure() {
      failAudit = true;
    },
    setPersistAfterWriteFailure(value: boolean) {
      failPersistAfterWrite = value;
    },
    revoke() {
      sessionActive = false;
    },
    resetLimit() {
      calls = 0;
    },
    async close() {
      await db?.close();
    },
    addPage(
      sourceId = testSource,
      recordId = randomUUID(),
      title = "Existing record",
    ) {
      const id = randomUUID();
      const p: FakePage = {
        object: "page",
        id,
        parent: { type: "data_source_id", data_source_id: uuid(sourceId) },
        last_edited_time: edited(),
        in_trash: false,
        properties: bodyProperties({
          title: { title: [{ type: "text", text: { content: title } }] },
          stable: {
            rich_text: [{ type: "text", text: { content: recordId } }],
          },
        }),
      };
      pages.set(id, p);
      return p;
    },
  };
}
