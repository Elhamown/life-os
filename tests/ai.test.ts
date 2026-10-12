import { test } from "node:test";
import assert from "node:assert/strict";
import { aiApi, type AiContext } from "../app/lib/ai/api";
import { aiConfig, productionProvider } from "../app/lib/ai/provider";
import { fields, authorizedItems } from "../app/lib/ai/validation";
import { cookieName, digest, issueToken } from "../app/lib/private/crypto";
import type { Store } from "../app/lib/private/store";
import type { PrivateConfig } from "../app/lib/private/config";
import type { AiFields, AuthorizedItem } from "../app/lib/ai/model";
import type { AuditEntry } from "../app/lib/notion/types";
const config: PrivateConfig = {
  origin: "https://madar.example",
  passwordHash: "unused",
  sessionSecret: "a".repeat(64),
  encryptionKey: "b".repeat(64),
  databaseUrl: "fixture",
  notionToken: null,
  readOnlyAcknowledged: false,
  secureCookies: true,
};
const proposal: AiFields = {
  kind: "task",
  operation: "create",
  spaceId: "studies",
  title: "مراجعة الفصل",
  date: "2026-10-11",
  time: null,
  durationMinutes: null,
  details: "",
  contextIds: [],
};
const actual: AuthorizedItem = {
  id: "actual-task",
  kind: "task",
  spaceId: "studies",
  title: "مهمة مؤكدة",
  date: "2026-10-11",
  time: null,
  durationMinutes: null,
};
async function fixture() {
  const state = new Map<string, unknown>();
  const logs: unknown[] = [];
  let count = 0,
    calls = 0,
    notionCalls = 0,
    failAudit = false;
  let active: string | null = null;
  let output: unknown = { proposals: [proposal], planningIds: [] };
  let lastMessage = "",
    lastContext: AuthorizedItem[] = [];
  const store: Store = {
    async get<T>(key: string) {
      return structuredClone(state.get(key) ?? null) as T | null;
    },
    async put(key, value) {
      state.set(key, structuredClone(value));
    },
    async putUnderLease(key, value) {
      state.set(key, value);
      return true;
    },
    async putAudited(key, value, event, n) {
      if (failAudit) throw Error("private-db-secret");
      logs.push({ event, outcome: "ok", count: n });
      state.set(key, structuredClone(value));
    },
    async session(hash) {
      return hash === digest("c".repeat(64));
    },
    async createSession() {},
    async revokeSession() {},
    async consume() {
      return ++count <= 20;
    },
    async lease(_name, id) {
      if (active) return false;
      active = id;
      return true;
    },
    async release(_name, id) {
      if (id === active) active = null;
    },
    async audit(event, outcome, n = 0) {
      if (failAudit) throw Error("private-db-secret");
      logs.push({ event, outcome, count: n });
    },
    async logs() {
      return logs as AuditEntry[];
    },
  };
  const context: AiContext = {
    config,
    store,
    notion() {
      notionCalls++;
      throw Error("Notion must never execute");
    },
    ai: aiConfig({
      MADAR_AI_API_KEY: "test-fake-key",
      MADAR_AI_EXTERNAL_PROCESSING_ACK: "1",
    }),
    provider: () => ({
      async propose(message, source) {
        calls++;
        lastMessage = message;
        lastContext = source;
        return output;
      },
      async transcribe() {
        calls++;
        return "هذا نص عربي قابل للتحرير";
      },
    }),
  };
  const cookie = `${cookieName(config)}=${await issueToken(config, "c".repeat(64))}`;
  const request = (
    action: string,
    body: unknown = {},
    options: {
      anonymous?: boolean;
      origin?: string;
      method?: string;
      area?: string;
    } = {},
  ) =>
    new Request(
      `https://madar.example/api/ai/${action}?spaceId=${options.area ?? "studies"}`,
      {
        method: options.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: options.origin ?? config.origin,
          ...(options.anonymous ? {} : { Cookie: cookie }),
        },
        ...(options.method === "GET"
          ? {}
          : {
              body: JSON.stringify({ spaceId: "studies", ...(body as object) }),
            }),
      },
    );
  const invoke = (
    action: string,
    body: unknown = {},
    options?: Parameters<typeof request>[2],
  ) => aiApi(request(action, body, options), action, context);
  const send = {
    message: "أضف مهمة مراجعة",
    spaceId: "studies",
    today: "2026-10-11",
    consent: true,
  };
  return {
    state,
    logs,
    context,
    cookie,
    request,
    invoke,
    send,
    get calls() {
      return calls;
    },
    get notionCalls() {
      return notionCalls;
    },
    get lastContext() {
      return lastContext;
    },
    get lastMessage() {
      return lastMessage;
    },
    setOutput(value: unknown) {
      output = value;
    },
    setAuditFailure() {
      failAudit = true;
    },
  };
}
test("AI data is isolated by selected area, including legacy data and model references", async () => {
  const f = await fixture();
  const other = { ...actual, id: "stardust-private", spaceId: "stardust" };
  const studio = { ...actual, id: "studio-private", spaceId: "studio" };
  const personal = { ...actual, id: "personal-private", spaceId: "life" };
  const legacy = [actual, other, studio, personal];
  f.state.set("ai-context", legacy);
  const result = await f.invoke("propose", f.send);
  assert.equal(result.status, 200);
  assert.deepEqual(f.lastContext, [actual]);
  const status = await f.invoke(
    "status",
    {},
    { method: "GET", area: "stardust" },
  );
  assert.deepEqual((await status.json()).context, [other]);
  assert.equal(
    (
      await f.invoke("context", {
        items: [actual, other],
        consent: true,
        confirmedActual: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.invoke("context", {
        items: [actual],
        consent: true,
        confirmedActual: true,
      })
    ).status,
    200,
  );
  assert.deepEqual(f.state.get("ai-context"), legacy); // no implicit migration or deletion
  assert.deepEqual(f.state.get("ai-context:studies"), [actual]);
  f.setOutput({
    proposals: [{ ...proposal, spaceId: "studio" }],
    planningIds: [],
  });
  assert.equal((await f.invoke("propose", f.send)).status, 502);
  f.setOutput({ proposals: [], planningIds: [other.id] });
  assert.equal(
    (await f.invoke("propose", { ...f.send, planning: true })).status,
    502,
  );
  assert.equal(f.notionCalls, 0);
});
test("private proposal reads/decisions cannot cross an area boundary", async () => {
  const f = await fixture();
  const created = await (await f.invoke("propose", f.send)).json();
  const pending = created.proposals[0];
  assert.equal(
    (
      await f.invoke("decision", {
        id: pending.id,
        spaceId: "stardust",
        decision: "approved",
        confirmed: true,
        fields: proposal,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.invoke("decision", {
        id: pending.id,
        decision: "approved",
        confirmed: true,
        fields: { ...proposal, spaceId: "studio" },
      })
    ).status,
    403,
  );
  const status = await (
    await f.invoke("status", {}, { method: "GET", area: "studio" })
  ).json();
  assert.deepEqual(status.proposals, []);
  for (const area of ["ministry", "health", "../studio", "team"])
    assert.equal(
      (await f.invoke("status", {}, { method: "GET", area })).status,
      400,
    );
});
test("AI denies anonymous and cross-origin requests before provider construction", async () => {
  const f = await fixture();
  for (const action of [
    "status",
    "propose",
    "transcribe",
    "context",
    "decision",
  ]) {
    assert.equal(
      (
        await f.invoke(action, f.send, {
          anonymous: true,
          method: action === "status" ? "GET" : "POST",
        })
      ).status,
      401,
    );
  }
  assert.equal(
    (await f.invoke("propose", f.send, { origin: "https://evil.example" }))
      .status,
    403,
  );
  assert.equal(f.calls, 0);
  assert.equal(f.notionCalls, 0);
});
test("AI consent, destination and deployment acknowledgement are mandatory", async () => {
  const f = await fixture();
  for (const v of [
    { ...f.send, consent: false },
    { ...f.send, spaceId: "ministry" },
    { ...f.send, spaceId: "health" },
  ])
    assert.equal((await f.invoke("propose", v)).status, 400);
  f.context.ai.enabled = false;
  assert.equal((await f.invoke("propose", f.send)).status, 503);
  assert.equal(f.calls, 0);
});
test("server rate limits prevent extra billable calls", async () => {
  const f = await fixture();
  for (let i = 0; i < 20; i++)
    assert.equal((await f.invoke("propose", f.send)).status, 200);
  const r = await f.invoke("propose", f.send);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "600");
  assert.equal(f.calls, 20);
});
test("audit persistence fails closed and upstream exceptions never escape", async () => {
  const f = await fixture();
  f.setAuditFailure();
  const r = await f.invoke("propose", f.send);
  assert.equal(r.status, 503);
  assert.equal(f.calls, 0);
  assert.ok(!(await r.text()).includes("private-db-secret"));
});
test("only explicitly confirmed actual context is saved; sensitive areas rejected", async () => {
  const f = await fixture();
  assert.equal(
    (await f.invoke("context", { items: [actual], consent: true })).status,
    400,
  );
  for (const spaceId of ["ministry", "health"])
    assert.equal(
      (
        await f.invoke("context", {
          items: [{ ...actual, spaceId }],
          consent: true,
          confirmedActual: true,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await f.invoke("context", {
        items: [actual],
        consent: true,
        confirmedActual: true,
      })
    ).status,
    200,
  );
  assert.deepEqual(f.state.get("ai-context:studies"), [actual]);
  assert.equal(f.calls, 0);
});
test("daily planning requires actual context and returns only server-authorized records", async () => {
  const f = await fixture();
  assert.equal(
    (await f.invoke("propose", { ...f.send, planning: true })).status,
    409,
  );
  assert.equal(f.calls, 0);
  f.state.set("ai-context", [actual]);
  f.setOutput({ proposals: [], planningIds: [actual.id] });
  const r = await f.invoke("propose", { ...f.send, planning: true });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).plan, [actual]);
  assert.deepEqual(f.lastContext, [actual]);
  f.setOutput({ proposals: [], planningIds: ["invented-commitment"] });
  assert.equal(
    (await f.invoke("propose", { ...f.send, planning: true })).status,
    502,
  );
  f.setOutput({ proposals: [proposal], planningIds: [] });
  assert.equal(
    (await f.invoke("propose", { ...f.send, planning: true })).status,
    502,
  );
});
test("corrupt stored sensitive context cannot reach the external provider", async () => {
  const f = await fixture();
  f.state.set("ai-context", [{ ...actual, spaceId: "health" }]);
  assert.equal((await f.invoke("propose", f.send)).status, 400);
  assert.equal(f.calls, 0);
});
test("model output rejects writes, bulk updates, unknown keys and invalid destinations/references", async () => {
  const f = await fixture();
  for (const p of [
    { ...proposal, operation: "delete" },
    { ...proposal, operation: "reschedule" },
    { ...proposal, operation: "bulk-update" },
    { ...proposal, spaceId: "ministry" },
    { ...proposal, spaceId: "health" },
    { ...proposal, contextIds: ["fake"] },
    { ...proposal, notionId: "fake" },
    { ...proposal, kind: "event" },
    { ...proposal, date: "2026-02-30" },
  ]) {
    f.setOutput({ proposals: [p], planningIds: [] });
    assert.equal((await f.invoke("propose", f.send)).status, 502);
  }
  assert.equal(f.notionCalls, 0);
  assert.equal(f.state.has("ai-proposals"), false);
});
test("typed tasks/events/notes/study are drafts; edit/approve/reject never call Notion", async () => {
  const f = await fixture();
  for (const kind of ["task", "event", "note", "study"] as const) {
    f.setOutput({
      proposals: [
        {
          ...proposal,
          kind,
          date: "2026-10-11",
          time: "14:00",
          durationMinutes: 25,
        },
      ],
      planningIds: [],
    });
    const r = await f.invoke("propose", f.send);
    const p = (await r.json()).proposals[0];
    assert.equal(p.status, "pending");
    assert.equal(
      (
        await f.invoke("decision", {
          id: p.id,
          fields: proposal,
          decision: "approved",
        })
      ).status,
      400,
    );
    const decision = await f.invoke("decision", {
      id: p.id,
      fields: {
        ...proposal,
        kind,
        title: "عنوان محرر",
        time: "14:00",
        durationMinutes: 25,
      },
      decision: "approved",
      confirmed: true,
    });
    assert.equal(decision.status, 200);
    assert.equal((await decision.json()).proposal.title, "عنوان محرر");
    assert.equal(
      (
        await f.invoke("decision", {
          id: p.id,
          fields: proposal,
          decision: "rejected",
          confirmed: true,
        })
      ).status,
      409,
    );
  }
  const r = await f.invoke("propose", f.send);
  const p = (await r.json()).proposals[0];
  const count = f.calls;
  assert.equal(
    (
      await f.invoke("decision", {
        id: p.id,
        decision: "rejected",
        confirmed: true,
      })
    ).status,
    200,
  );
  assert.equal(f.calls, count);
  assert.equal(f.notionCalls, 0);
  assert.ok(!JSON.stringify(f.logs).includes(proposal.title));
  assert.ok(!JSON.stringify(f.logs).includes(f.send.message));
});
test("status is private/no-store and never exposes keys or suggests write availability", async () => {
  const f = await fixture();
  const r = await f.invoke("status", {}, { method: "GET" });
  assert.equal(r.headers.get("Cache-Control"), "private, no-store, max-age=0");
  const body = await r.text();
  assert.ok(!body.includes("test-fake-key"));
  assert.ok(body.includes("draft-only"));
  assert.equal(f.calls, 0);
});
test("malformed provider data, body caps and unsupported routes fail safely", async () => {
  const f = await fixture();
  f.setOutput({
    proposals: [],
    planningIds: [],
    answer: "invented commitment",
  });
  assert.equal((await f.invoke("propose", f.send)).status, 502);
  assert.equal(
    (await f.invoke("propose", { ...f.send, message: "a".repeat(70000) }))
      .status,
    413,
  );
  assert.equal((await f.invoke("delete", {})).status, 405);
  assert.equal((await f.invoke("propose", {}, { method: "GET" })).status, 405);
});
test("audio requires consent/allowed scope, type/signature and bounded file size", async () => {
  const f = await fixture();
  const send = async (blob: Blob, consent = "1", area = "studies") => {
    const form = new FormData();
    form.set("audio", blob, "sensitive-name.webm");
    return aiApi(
      new Request("https://madar.example/api/ai/transcribe", {
        method: "POST",
        headers: {
          Origin: config.origin,
          Cookie: f.cookie,
          "X-Madar-Consent": consent,
          "X-Madar-Area": area,
        },
        body: form,
      }),
      "transcribe",
      f.context,
    );
  };
  const valid = new Uint8Array(32);
  valid.set([0x1a, 0x45, 0xdf, 0xa3]);
  assert.equal(
    (await send(new Blob([valid], { type: "audio/webm" }), "0")).status,
    400,
  );
  assert.equal(
    (await send(new Blob([valid], { type: "audio/webm" }), "1", "health"))
      .status,
    400,
  );
  assert.equal(
    (await send(new Blob([valid], { type: "text/plain" }))).status,
    400,
  );
  assert.equal(
    (
      await send(
        new Blob(["invalid-header-is-long-enough"], { type: "audio/webm" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await send(
        new Blob([new Uint8Array(4 * 1024 * 1024 + 5000)], {
          type: "audio/webm",
        }),
      )
    ).status,
    413,
  );
  assert.equal(f.calls, 0);
  const r = await send(new Blob([valid], { type: "audio/webm" }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).transcript, "هذا نص عربي قابل للتحرير");
  assert.equal(f.calls, 1);
  assert.equal(f.state.has("ai-proposals"), false);
});
test("production adapter sends strict schema/store:false, Arabic transcription and no browser endpoint", async () => {
  const captured: { url: string; init: RequestInit }[] = [];
  const cfg = aiConfig({
    MADAR_AI_API_KEY: "fake-server-key",
    MADAR_AI_EXTERNAL_PROCESSING_ACK: "1",
    MADAR_AI_BASE_URL: "https://provider.example/v1",
    MADAR_AI_MODEL: "configured-model",
  });
  const provider = productionProvider(cfg, async (url, init) => {
    captured.push({ url: String(url), init: init! });
    return Response.json(
      String(url).includes("transcriptions")
        ? { text: "نص" }
        : {
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({ proposals: [], planningIds: [] }),
                },
              },
            ],
          },
    );
  });
  await provider.propose("رسالة", [actual], "2026-10-11", false, "studies");
  await provider.transcribe(
    new File(["audio"], "capture.webm", { type: "audio/webm" }),
  );
  const request = JSON.parse(captured[0].init.body as string);
  assert.equal(request.model, "configured-model");
  assert.equal(request.store, false);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal((captured[1].init.body as FormData).get("language"), "ar");
  assert.equal(captured[0].init.redirect, "error");
  assert.equal(captured[0].init.cache, "no-store");
  assert.ok(!JSON.stringify(captured).includes("notion.com"));
});
test("provider failures/rate limits/truncation are safe and never retried into duplicate bills", async () => {
  const cfg = aiConfig({
    MADAR_AI_API_KEY: "fake",
    MADAR_AI_EXTERNAL_PROCESSING_ACK: "1",
  });
  let calls = 0;
  for (const status of [401, 429, 500]) {
    const provider = productionProvider(cfg, async () => {
      calls++;
      return new Response("secret-upstream-error", { status });
    });
    await assert.rejects(
      () => provider.propose("", [], "2026-10-11", false, "studies"),
      (e) => e instanceof Error && !e.message.includes("secret-upstream-error"),
    );
  }
  assert.equal(calls, 3);
  const p = productionProvider(cfg, async () =>
    Response.json({
      choices: [{ finish_reason: "length", message: { content: "{}" } }],
    }),
  );
  await assert.rejects(() => p.propose("", [], "2026-10-11", false, "studies"));
  assert.throws(() => aiConfig({ MADAR_AI_BASE_URL: "http://127.0.0.1" }));
  assert.throws(() =>
    aiConfig({ MADAR_AI_BASE_URL: "https://user:password@provider.example" }),
  );
  assert.equal(aiConfig({ MADAR_AI_API_KEY: "fake" }).enabled, false);
});
test("validation rejects duplicate actual IDs, invalid dates and unknown update operations", () => {
  assert.throws(() => authorizedItems([actual, actual]));
  assert.throws(() => fields({ ...proposal, date: "2026-02-30" }, []));
  assert.throws(() => fields({ ...proposal, operation: "update" }, []));
});
test("internal audit upgrade preserves previous rows and AI drafts persist encrypted atomically", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const { SqlStore } = await import("../app/lib/private/store");
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL("../scripts/private-store.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      "ALTER TABLE madar_private_audit DROP CONSTRAINT madar_private_audit_event_check; ALTER TABLE madar_private_audit ADD CONSTRAINT madar_private_audit_event_check CHECK(event IN ('login','logout','discovery_start','discovery_step','discovery_read','mappings_save','access_denied')); INSERT INTO madar_private_audit(id,event,outcome) VALUES('00000000-0000-4000-8000-000000000001','login','ok');",
    );
    await db.exec(
      await readFile(
        new URL("../scripts/ai-audit-upgrade.sql", import.meta.url),
        "utf8",
      ),
    );
    const store = new SqlStore(
      {
        async query<T extends Record<string, unknown>>(
          sql: string,
          values: unknown[] = [],
        ) {
          return (await db.query<T>(sql, values)).rows;
        },
      },
      config.encryptionKey,
    );
    assert.equal(await store.lease("notion-workflow", "fixture-lock"), true);
    await store.putAudited(
      "ai-proposals",
      [proposal],
      "ai_request",
      1,
      "fixture-lock",
    );
    assert.deepEqual(await store.get("ai-proposals"), [proposal]);
    assert.ok(
      !JSON.stringify(
        (await db.query("SELECT * FROM madar_private_state")).rows,
      ).includes(proposal.title),
    );
    assert.equal((await store.logs()).length, 2);
    await assert.rejects(() =>
      store.putAudited("ai-proposals", [], "ai_decision", 1, "wrong-lock"),
    );
    assert.deepEqual(await store.get("ai-proposals"), [proposal]);
  } finally {
    await db.close();
  }
});
