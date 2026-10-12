import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@notionhq/client";
import {
  syncFixture,
  fields,
  columns,
  testSource,
  realSource,
} from "./sync-fixtures";
import { syncTransport } from "../app/lib/sync/gateway";
import { NOTION_API_VERSION } from "../app/lib/notion/gateway";
import { hash, schemaHash, syncConfig } from "../app/lib/sync/validation";
import type { SyncLedger } from "../app/lib/sync/types";
import type { DiscoveryJob, Mapping } from "../app/lib/notion/types";
const writes = (f: Awaited<ReturnType<typeof syncFixture>>) =>
  f.requests.filter(
    (r) =>
      r.method === "PATCH" || (r.method === "POST" && r.path === "/v1/pages"),
  );
test("uncertain recovery survives scope re-approval and re-audit without renewing write consent", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setUnknownCreate();
  const uncertain = (await f.approve(action)).action;
  const job = (await f.store.get<DiscoveryJob>("discovery"))!;
  job.id = "new-read-only-report";
  job.revision++;
  await f.store.put("discovery", job);
  const mappings = (await f.store.get<Mapping[]>("mappings"))!;
  await f.store.put(
    "mappings",
    mappings.map((m) => ({ ...m, reportId: job.id })),
  );
  const ledger = (await f.store.get<SyncLedger>("sync"))!;
  ledger.scopes[0] = {
    ...ledger.scopes[0],
    reportId: job.id,
    revision: job.revision,
    approvedAt: "2026-10-12T10:00:00Z",
  };
  await f.store.put("sync", ledger);
  assert.equal(
    (
      await f.invoke("retry", {
        id: action.id,
        version: uncertain.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    409,
  );
  f.context.sync.enabled = false; // emergency write-off still permits scoped read reconciliation
  const recovered = await f.json("recover", {
    id: action.id,
    version: uncertain.version,
    approved: true,
  });
  assert.equal(recovered.action.state, "succeeded");
  assert.equal(recovered.action.pageId, [...f.pages.keys()][0]);
  assert.equal(writes(f).length, 1);
});
test("a full uncertain journal retains all history and permits one terminal read-only reconciliation", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setUnknownCreate();
  const uncertain = (await f.approve(action)).action;
  const ledger = (await f.store.get<SyncLedger>("sync"))!;
  const stored = ledger.actions.find((a) => a.id === action.id)!;
  while (stored.history.length < 40)
    stored.history.push({
      at: "2026-10-12T10:00:00Z",
      event: "review_pending",
      digest: stored.digest,
    });
  const previous = structuredClone(stored.history);
  await f.store.put("sync", ledger);
  const recovered = await f.json("recover", {
    id: action.id,
    version: uncertain.version,
    approved: true,
  });
  assert.equal(recovered.action.state, "succeeded");
  assert.equal(recovered.action.history.length, 41);
  assert.deepEqual(recovered.action.history.slice(0, 40), previous);
  assert.equal(writes(f).length, 1);
});
test("recovery rejects removed allowlists, revoked mappings and changed property scopes", async () => {
  for (const change of ["allowlist", "mapping", "columns", "area"] as const) {
    const f = await syncFixture();
    await f.scope();
    const { action } = await f.prepare();
    f.setUnknownCreate();
    const uncertain = (await f.approve(action)).action;
    if (change === "allowlist") f.context.sync.testIds = [];
    else if (change === "mapping") await f.store.put("mappings", []);
    else {
      const ledger = (await f.store.get<SyncLedger>("sync"))!;
      if (change === "columns") ledger.scopes[0].columns.title = "different";
      else ledger.scopes[0].area = "ministry";
      await f.store.put("sync", ledger);
    }
    const response = await f.invoke("recover", {
      id: action.id,
      version: uncertain.version,
      approved: true,
    });
    assert.ok([403, 409].includes(response.status));
    assert.equal(writes(f).length, 1);
  }
});
test("sync rejects unauthenticated, cross-origin, unapproved scope and destructive operations", async () => {
  const f = await syncFixture();
  for (const action of [
    "status",
    "scope",
    "prepare",
    "execute",
    "retry",
    "recover",
  ])
    assert.equal(
      (
        await f.invoke(
          action,
          {},
          { anonymous: true, method: action === "status" ? "GET" : "POST" },
        )
      ).status,
      401,
    );
  assert.equal(
    (await f.invoke("scope", {}, { origin: "https://evil.example" })).status,
    403,
  );
  for (const name of ["delete", "archive", "merge", "migrate", "bulk-update"])
    assert.equal((await f.invoke(name)).status, 405);
  assert.equal(f.requests.length, 0);
  assert.equal(
    (
      await f.invoke("scope", {
        sourceId: testSource,
        reportId: "report",
        revision: 1,
        columns,
      })
    ).status,
    400,
  );
  assert.equal(writes(f).length, 0);
});
test("separate tokens, server allowlists, completed audit and approved mapping are mandatory", async () => {
  const f = await syncFixture();
  f.context.sync.token = f.context.config.notionToken;
  assert.equal((await f.invoke("status", {}, { method: "GET" })).status, 503);
  f.context.sync.token = "fake-write-token";
  assert.equal(
    (
      await f.invoke("scope", {
        sourceId: randomUUID(),
        reportId: "report",
        revision: 1,
        columns,
        approved: true,
      })
    ).status,
    409,
  );
  await f.store.put("mappings", []);
  assert.equal(
    (
      await f.invoke("scope", {
        sourceId: testSource,
        reportId: "report",
        revision: 1,
        columns,
        approved: true,
        disposableConfirmed: true,
      })
    ).status,
    409,
  );
  assert.equal(f.requests.length, 0);
  const config = syncConfig({ NOTION_SYNC_TOKEN: "fake" });
  assert.equal(config.enabled, false);
  assert.throws(() =>
    syncConfig({
      NOTION_SYNC_TEST_SOURCE_IDS: testSource,
      NOTION_SYNC_WRITE_SOURCE_IDS: testSource,
    }),
  );
});
test("existing sources stay locked until real gateway create/update/readback test evidence", async () => {
  const f = await syncFixture();
  assert.equal(
    (
      await f.invoke("scope", {
        sourceId: realSource,
        reportId: "report",
        revision: 1,
        columns,
        approved: true,
      })
    ).status,
    409,
  );
  await f.gate();
  await f.scope(realSource);
  assert.equal((await f.invoke("status", {}, { method: "GET" })).status, 200);
  assert.equal(
    f.requests.every((r) => r.version === NOTION_API_VERSION),
    true,
  );
  f.context.sync.connectionHash = hash("changed-token");
  assert.equal(
    (
      await f.invoke("prepare", {
        sourceId: realSource,
        recordId: randomUUID(),
        operation: "create",
        origin: "manual",
        fields,
      })
    ).status,
    409,
  );
});
test("create approval is exact, idempotent and preserves stable IDs without duplicate pages", async () => {
  const f = await syncFixture();
  await f.scope();
  const id = randomUUID();
  const { action } = await f.prepare(id);
  assert.equal(writes(f).length, 0);
  assert.equal(
    (
      await f.invoke("execute", {
        id: action.id,
        version: action.version,
        digest: "changed",
        approved: true,
      })
    ).status,
    403,
  );
  assert.equal(writes(f).length, 0);
  const result = await f.approve(action);
  assert.equal(result.action.state, "succeeded");
  assert.equal(f.pages.size, 1);
  assert.equal(writes(f).length, 1);
  const pageId = result.action.pageId;
  const repeated = await f.approve(result.action);
  assert.equal(repeated.action.pageId, pageId);
  assert.equal(writes(f).length, 1);
  const reprepare = await f.prepare(id);
  assert.equal(reprepare.action.id, action.id);
  assert.equal(writes(f).length, 1);
  assert.deepEqual(result.ledger.bindings[id], {
    sourceId: testSource,
    pageId,
  });
});
test("uncertain committed create is never resent and recovers by stable ID without writes", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setUnknownCreate();
  const result = await f.approve(action);
  assert.equal(result.action.state, "uncertain");
  assert.equal(f.pages.size, 1);
  assert.equal(
    (
      await f.invoke("retry", {
        id: action.id,
        version: result.action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    409,
  );
  const recovered = await f.json("recover", {
    id: action.id,
    version: result.action.version,
    approved: true,
  });
  assert.equal(recovered.action.state, "succeeded");
  assert.equal(writes(f).length, 1);
});
test("a successful write followed by a read-only 429 is quarantined without replay", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setReadFailureAfterCreate();
  const result = await f.approve(action);
  assert.equal(result.action.state, "uncertain");
  assert.ok(result.action.pageId);
  assert.equal(writes(f).length, 1);
  assert.equal(
    (
      await f.invoke("retry", {
        id: action.id,
        version: result.action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    409,
  );
  const recovered = await f.json("recover", {
    id: action.id,
    version: result.action.version,
    approved: true,
  });
  assert.equal(recovered.action.state, "succeeded");
  assert.equal(writes(f).length, 1);
  assert.equal(f.pages.size, 1);
});
test("unconfirmed absence after ambiguous create stays quarantined even on repeated recovery", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setUnknownCreate();
  const result = await f.approve(action);
  f.pages.clear();
  const recovery = await f.json("recover", {
    id: action.id,
    version: result.action.version,
    approved: true,
  });
  assert.equal(recovery.action.state, "uncertain");
  assert.equal(recovery.action.error, "SYNC_RECONCILE_NOT_FOUND");
  assert.equal(writes(f).length, 1);
  assert.equal(
    (
      await f.invoke("prepare", {
        sourceId: testSource,
        recordId: action.recordId,
        operation: "update",
        pageId: randomUUID(),
        origin: "manual",
        fields,
      })
    ).status,
    403,
  ); // disposable updates require a verified MADAR create
});
test("duplicate stable IDs and incomplete query responses never trigger merges or writes", async () => {
  const f = await syncFixture();
  await f.scope();
  const id = randomUUID();
  f.addPage(testSource, id);
  f.addPage(testSource, id);
  const { action } = await f.prepare(id);
  assert.equal(action.state, "conflict");
  assert.equal(action.candidates.length, 2);
  assert.equal(writes(f).length, 0);
  f.setIncomplete();
  assert.equal(
    (
      await f.invoke("prepare", {
        sourceId: testSource,
        recordId: randomUUID(),
        operation: "create",
        origin: "manual",
        fields,
      })
    ).status,
    502,
  );
  assert.equal(writes(f).length, 0);
});
test("updates retain page IDs/schemas and detect remote edits instead of overwriting", async () => {
  const f = await syncFixture();
  const { created } = await f.gate();
  const { action } = await f.prepare(
    created.recordId,
    { ...fields, title: "اختبار مدار · تغيير جديد" },
    testSource,
    "update",
    created.pageId,
  );
  const p = f.pages.get(created.pageId)!;
  p.last_edited_time = f.edited();
  p.properties.title = {
    id: "title",
    title: [{ text: { content: "External edit" } }],
  };
  const before = writes(f).length;
  const conflict = await f.approve(action);
  assert.equal(conflict.action.state, "conflict");
  assert.equal(conflict.action.error, "SYNC_REMOTE_CHANGED");
  assert.equal(writes(f).length, before);
  assert.equal(conflict.action.pageId, created.pageId);
  const fresh = await f.prepare(
    created.recordId,
    { ...fields, title: "اختبار مدار · تغيير مقصود" },
    testSource,
    "update",
    created.pageId,
  );
  const done = await f.approve(fresh.action);
  assert.equal(done.action.state, "succeeded");
  assert.equal(done.action.pageId, created.pageId);
  assert.equal(
    f.requests.some(
      (r) => r.path.includes("data_sources") && r.method === "PATCH",
    ),
    false,
  );
});
test("schema drift and post-write races are surfaced for review", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setSchemaChanged();
  const result = await f.approve(action);
  assert.equal(result.action.state, "conflict");
  assert.equal(result.action.error, "SYNC_SCHEMA_CHANGED");
  assert.equal(writes(f).length, 0);
  const g = await syncFixture();
  const { created } = await g.gate();
  const { action: update } = await g.prepare(
    created.recordId,
    { ...fields, title: "اختبار مدار · كتابة متزامنة" },
    testSource,
    "update",
    created.pageId,
  );
  g.setPostWriteConflict();
  const changed = await g.approve(update);
  assert.equal(changed.action.state, "conflict");
  assert.equal(changed.action.error, "SYNC_READBACK_CONFLICT");
});
test("known 429 failures have persisted wait and an explicit reapproved retry", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setRateLimit();
  const failed = await f.approve(action);
  assert.equal(failed.action.state, "failed");
  assert.ok(failed.action.retryAt);
  assert.equal(f.pages.size, 0);
  assert.equal(
    (
      await f.invoke("retry", {
        id: action.id,
        version: failed.action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    429,
  );
  const ledger = await f.store.get<SyncLedger>("sync");
  ledger!.actions[0].retryAt = new Date(Date.now() - 1000).toISOString();
  await f.store.put("sync", ledger);
  const retried = await f.approve(failed.action, "retry");
  assert.equal(retried.action.state, "succeeded");
  assert.equal(retried.action.attempts, 2);
  assert.equal(f.pages.size, 1);
});
test("ambiguous updates reconcile desired outcome and never repeat their PATCH", async () => {
  const f = await syncFixture();
  const { created } = await f.gate();
  const { action } = await f.prepare(
    created.recordId,
    { ...fields, title: "اختبار مدار · تحديث غامض" },
    testSource,
    "update",
    created.pageId,
  );
  f.setUnknownUpdate();
  const unknown = await f.approve(action);
  assert.equal(unknown.action.state, "uncertain");
  const before = writes(f).length;
  const recovered = await f.json("recover", {
    id: action.id,
    version: unknown.action.version,
    approved: true,
  });
  assert.equal(recovered.action.state, "succeeded");
  assert.equal(writes(f).length, before);
});
test("AI draft approval is not write approval; exact destination/fields/proposal must match", async () => {
  const f = await syncFixture();
  await f.gate();
  await f.scope(realSource);
  const id = randomUUID();
  await f.store.put("ai-proposals", [
    {
      id,
      status: "approved",
      title: fields.title,
      details: "",
      date: null,
      time: null,
      durationMinutes: null,
      kind: "note",
      spaceId: "life",
    },
  ]);
  const count = writes(f).length;
  const result = await f.prepare(id, fields, realSource, "create", null, {
    origin: "ai",
    proposalId: id,
  });
  assert.equal(writes(f).length, count);
  const success = await f.approve(result.action);
  assert.equal(success.action.state, "succeeded");
  assert.equal(
    (
      await f.invoke("prepare", {
        sourceId: realSource,
        recordId: randomUUID(),
        fields: { ...fields, title: "Edited elsewhere" },
        operation: "create",
        origin: "ai",
        proposalId: id,
      })
    ).status,
    409,
  );
  const mappings =
    (await f.store.get<{ sourceId: string; area: string; reportId: string }[]>(
      "mappings",
    ))!;
  mappings.find((m) => m.sourceId === realSource)!.area = "health";
  await f.store.put("mappings", mappings);
  assert.equal(
    (
      await f.invoke("prepare", {
        sourceId: realSource,
        recordId: id,
        fields,
        operation: "create",
        origin: "ai",
        proposalId: id,
      })
    ).status,
    409,
  );
});
test("audit persistence/revoked sessions fail closed, logs omit payloads and secrets", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setAuditFailure();
  assert.equal(
    (
      await f.invoke("execute", {
        id: action.id,
        version: action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    503,
  );
  assert.equal(writes(f).length, 0);
  assert.ok(!JSON.stringify(f.logs).includes(fields.title));
  assert.ok(!JSON.stringify(f.logs).includes("fake-write-token"));
  const g = await syncFixture();
  await g.scope();
  const prepared = await g.prepare();
  g.revoke();
  assert.equal(
    (
      await g.invoke("execute", {
        id: prepared.action.id,
        version: prepared.action.version,
        digest: prepared.action.digest,
        approved: true,
      })
    ).status,
    401,
  );
  assert.equal(writes(g).length, 0);
});
test("post-dispatch store failure leaves durable uncertain journal, recovery avoids duplicate", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setPersistAfterWriteFailure(true);
  assert.equal(
    (
      await f.invoke("execute", {
        id: action.id,
        version: action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    503,
  );
  const ledger = await f.store.get<SyncLedger>("sync");
  assert.equal(ledger!.actions[0].state, "writing");
  assert.equal(ledger!.actions[0].writeDispatched, true);
  assert.equal(writes(f).length, 1);
  f.setPersistAfterWriteFailure(false);
  const result = await f.json("recover", {
    id: action.id,
    version: ledger!.actions[0].version,
    approved: true,
  });
  assert.equal(result.action.state, "succeeded");
  assert.equal(writes(f).length, 1);
});
test("SQL + official SDK integration preserves encrypted journal/history and existing audit rows", async () => {
  const f = await syncFixture(true);
  try {
    await f.db!.exec(
      "ALTER TABLE madar_private_audit DROP CONSTRAINT madar_private_audit_event_check; ALTER TABLE madar_private_audit ADD CONSTRAINT madar_private_audit_event_check CHECK(event IN ('login','logout','discovery_start','discovery_step','discovery_read','mappings_save','access_denied','ai_request','ai_transcribe','ai_decision','ai_context'))",
    );
    await f.store.audit("login", "ok");
    await f.db!.exec(
      await readFile(
        new URL("../scripts/sync-audit-upgrade.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.ok((await f.store.logs()).some((entry) => entry.event === "login"));
    await f.gate();
    await f.scope(realSource);
    const { action } = await f.prepare(
      randomUUID(),
      { ...fields, title: "Authorized existing source record" },
      realSource,
    );
    const result = await f.approve(action);
    assert.equal(result.action.state, "succeeded");
    assert.equal(result.ledger.testEvidence.sourceId, testSource);
    const stored = await f.db!.query(
      "SELECT ciphertext FROM madar_private_state",
    );
    assert.ok(
      !JSON.stringify(stored.rows).includes(
        "Authorized existing source record",
      ),
    );
    const audit = await f.store.logs();
    assert.ok(audit.some((a) => a.event === "sync_attempt"));
    assert.ok(audit.some((a) => a.event === "sync_result"));
    assert.equal(
      result.action.history.some(
        (h: { event: string; payload?: unknown }) =>
          h.event === "approved" && !!h.payload,
      ),
      true,
    );
  } finally {
    await f.close();
  }
});
test("scoped transport independently denies all unapproved targets, bodies, schema and destructive writes", async () => {
  const f = await syncFixture();
  await f.scope();
  const ledger = (await f.store.get<SyncLedger>("sync"))!;
  const scope = ledger.scopes[0];
  const pageId = randomUUID(),
    recordId = randomUUID(),
    payload = {
      title: {
        title: [{ type: "text" as const, text: { content: "approved" } }],
      },
      stable: {
        rich_text: [{ type: "text" as const, text: { content: recordId } }],
      },
    };
  const client = new Client({
    auth: "fake",
    notionVersion: NOTION_API_VERSION,
    retry: false,
    logger: () => undefined,
    fetch: syncTransport(
      scope,
      { recordId, pageId, payload, operation: "update", approved: true },
      f.upstream,
      async () => {},
    ),
  });
  const before = f.requests.length;
  for (const operation of [
    () => client.pages.update({ page_id: pageId, in_trash: true }),
    () =>
      client.pages.update({
        page_id: pageId,
        properties: { ...payload, unapproved: { checkbox: true } },
      }),
    () => client.pages.update({ page_id: randomUUID(), properties: payload }),
    () =>
      client.pages.create({
        parent: { data_source_id: testSource },
        properties: payload,
      }),
    () =>
      client.dataSources.update({
        data_source_id: testSource,
        title: [{ text: { content: "New schema" } }],
      }),
    () => client.blocks.children.append({ block_id: pageId, children: [] }),
    () => client.request({ path: `pages/${pageId}`, method: "delete" }),
  ])
    await assert.rejects(operation);
  assert.equal(f.requests.length, before);
  assert.equal(schemaHash({ id: testSource, properties: [] }).length, 64);
});
test("failed review can renew safely; changed approval cannot mutate a terminal success", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  f.setRateLimit();
  const failed = await f.approve(action);
  const renewed = await f.json("renew", {
    id: action.id,
    version: failed.action.version,
    approved: true,
  });
  assert.equal(renewed.action.state, "pending");
  assert.equal(renewed.action.approvedAt, null);
  const success = await f.approve(renewed.action);
  const stored = await f.store.get<SyncLedger>("sync");
  assert.equal(
    (
      await f.invoke("retry", {
        id: action.id,
        version: success.action.version,
        digest: "wrong",
        approved: false,
      })
    ).status,
    403,
  );
  assert.deepEqual(await f.store.get("sync"), stored);
  assert.equal(f.pages.size, 1);
});
test("page membership and existing stable IDs cannot be replaced by binding requests", async () => {
  const f = await syncFixture();
  await f.gate();
  await f.scope(realSource);
  const foreign = f.addPage(testSource, randomUUID());
  assert.equal(
    (
      await f.invoke("prepare", {
        sourceId: realSource,
        recordId: randomUUID(),
        operation: "update",
        origin: "manual",
        pageId: foreign.id,
        fields,
      })
    ).status,
    403,
  );
  const old = f.addPage(realSource, randomUUID());
  const before = writes(f).length;
  const preview = await f.prepare(
    randomUUID(),
    fields,
    realSource,
    "update",
    old.id,
  );
  assert.equal(preview.action.state, "conflict");
  assert.equal(writes(f).length, before);
  assert.equal(old.properties.stable.rich_text instanceof Array, true);
});
test("expiry, revocation and stable audit/mapping version checks prevent stale approvals", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  const ledger = (await f.store.get<SyncLedger>("sync"))!;
  ledger.actions[0].createdAt = new Date(Date.now() - 16 * 60000).toISOString();
  await f.store.put("sync", ledger);
  assert.equal(
    (
      await f.invoke("execute", {
        id: action.id,
        version: action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    409,
  );
  assert.equal(writes(f).length, 0);
  await f.store.put("mappings", []);
  assert.equal(
    (
      await f.invoke("execute", {
        id: action.id,
        version: action.version,
        digest: action.digest,
        approved: true,
      })
    ).status,
    409,
  );
  assert.equal(writes(f).length, 0);
});
test("token rotation invalidates test evidence and cannot reuse old creation proof", async () => {
  const f = await syncFixture();
  const { created } = await f.gate();
  f.context.sync.connectionHash = hash("rotation");
  const id = randomUUID();
  const create = await f.prepare(id);
  const fresh = await f.approve(create.action);
  assert.equal(fresh.action.state, "succeeded");
  const update = await f.prepare(
    created.recordId,
    { ...fields, title: "اختبار مدار · على توكن جديد" },
    testSource,
    "update",
    created.pageId,
  );
  const done = await f.approve(update.action);
  assert.notEqual(
    done.ledger.testEvidence.connectionHash,
    f.context.sync.connectionHash,
  );
  assert.equal(
    (
      await f.invoke("scope", {
        sourceId: realSource,
        reportId: "report",
        revision: 1,
        columns,
        approved: true,
      })
    ).status,
    409,
  );
});
