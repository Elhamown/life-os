import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordsApi,
  recordReader,
  type ReadScope,
} from "../app/lib/notion/records";
import { PrivateError } from "../app/lib/private/errors";
import { syncFixture, testSource } from "./sync-fixtures";
import type { Mapping, DiscoveryJob } from "../app/lib/notion/types";
async function setup() {
  const f = await syncFixture();
  await f.store.put("mappings", [
    {
      sourceId: testSource,
      area: "life",
      aiIngestion: false,
      approvedAt: "2026-10-12",
      reportId: "report",
    },
  ] satisfies Mapping[]);
  await f.store.put("discovery", {
    id: "report",
    items: [
      {
        id: testSource,
        kind: "data_source",
        verified: true,
        schema: [{ id: "title", name: "Name", type: "title" }],
      },
    ],
  } as DiscoveryJob);
  return f;
}
function request(
  f: Awaited<ReturnType<typeof setup>>,
  body?: unknown,
  cookie = f.cookie,
) {
  return new Request(f.context.config.origin + "/api/notion-records", {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: f.context.config.origin,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("read synchronization requires explicit mapped property approval, preserves checkpoints and deduplicates IDs", async () => {
  const f = await setup();
  let calls = 0;
  const reader = async () => {
    calls++;
    return {
      rows: [
        {
          id: "record-1",
          title: "سجل مصرح للاختبار",
          editedAt: "2026-10-12T10:00:00.000Z",
        },
      ],
      cursor: null,
    };
  };
  const configure = {
    action: "configure",
    sourceId: testSource,
    titlePropertyId: "title",
    approved: true,
    automatic: true,
  };
  assert.equal(
    (await recordsApi(request(f, undefined, ""), f.context, reader)).status,
    401,
  );
  assert.equal(
    (
      await recordsApi(
        request(f, { ...configure, approved: false }),
        f.context,
        reader,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await recordsApi(
        request(f, { ...configure, titlePropertyId: "unknown" }),
        f.context,
        reader,
      )
    ).status,
    409,
  );
  assert.equal(
    (await recordsApi(request(f, configure), f.context, reader)).status,
    200,
  );
  assert.equal(calls, 0);
  let scope = (
    await (
      await recordsApi(
        request(f, { action: "step", sourceId: testSource, revision: 0 }),
        f.context,
        reader,
      )
    ).json()
  ).scope as ReadScope;
  assert.equal(scope.records.length, 1);
  assert.ok(scope.lastSuccess);
  assert.ok(scope.since);
  assert.equal(scope.error, null);
  assert.equal(
    (
      await recordsApi(
        request(f, { action: "step", sourceId: testSource, revision: 0 }),
        f.context,
        reader,
      )
    ).status,
    409,
  );
  assert.equal(calls, 1);
  scope = (
    await (
      await recordsApi(
        request(f, { action: "step", sourceId: testSource, revision: 1 }),
        f.context,
        reader,
      )
    ).json()
  ).scope;
  assert.equal(scope.records.length, 1);
  const before = scope.lastSuccess;
  scope = (
    await (
      await recordsApi(
        request(f, { action: "step", sourceId: testSource, revision: 2 }),
        f.context,
        async () => {
          throw new PrivateError("NOTION_RATE_LIMITED", 429, 120);
        },
      )
    ).json()
  ).scope;
  assert.equal(scope.records.length, 1);
  assert.equal(scope.lastSuccess, before);
  assert.equal(scope.error, "NOTION_RATE_LIMITED");
  assert.ok(Date.parse(scope.retryAt!) >= Date.now() + 119000);
  assert.equal(
    (
      await recordsApi(
        request(f, {
          action: "step",
          sourceId: testSource,
          revision: scope.revision,
        }),
        f.context,
        reader,
      )
    ).status,
    429,
  );
  assert.equal(calls, 2);
  assert.equal(f.requests.length, 0);
});
test("read-only SDK transport makes only the exact approved query and strips every non-title property", async () => {
  let calls = 0;
  const scope: ReadScope = {
    sourceId: testSource,
    area: "life",
    titlePropertyId: "title",
    automatic: false,
    revision: 0,
    lastSuccess: null,
    since: null,
    cursor: null,
    seen: [],
    cycleStarted: null,
    retryAt: null,
    failures: 0,
    error: null,
    records: [],
  };
  const read = recordReader("fixture-token", async (input, init) => {
    calls++;
    assert.equal(
      new URL(input instanceof Request ? input.url : String(input)).pathname,
      `/v1/data_sources/${testSource}/query`,
    );
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.page_size, 50);
    assert.deepEqual(Object.keys(body).sort(), ["page_size", "sorts"]);
    return Response.json({
      object: "list",
      results: [
        {
          object: "page",
          id: "record-1",
          parent: { type: "data_source_id", data_source_id: testSource },
          last_edited_time: "2026-10-12T10:00:00.000Z",
          properties: {
            Name: {
              id: "title",
              type: "title",
              title: [{ plain_text: "عنوان مصرح" }],
            },
            Private: {
              id: "private",
              type: "rich_text",
              rich_text: [{ plain_text: "NEVER_IMPORT" }],
            },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    });
  });
  const result = await read(scope);
  assert.equal(calls, 1);
  assert.equal(result.rows[0].title, "عنوان مصرح");
  assert.ok(!JSON.stringify(result).includes("NEVER_IMPORT"));
});
