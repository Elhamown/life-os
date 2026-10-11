import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, APIErrorCode } from "@notionhq/client";
import {
  auditTransport,
  NOTION_API_VERSION,
  createReadOnlyNotion,
} from "../app/lib/notion/gateway";
import {
  discoveryStep,
  startDiscovery,
  INVENTORY_LIMIT,
} from "../app/lib/notion/discovery";
import {
  auditView,
  approveMappings,
  canIngestNotionIntoAi,
} from "../app/lib/notion/report";
import { PrivateError } from "../app/lib/private/errors";
import {
  id,
  source,
  page,
  search,
  database,
  mockNotion,
} from "./notion-fixtures";
import type { Mapping } from "../app/lib/notion/types";
const noSleep = async () => {};
test("official SDK write methods cannot reach upstream in audit mode", async () => {
  let calls = 0;
  const client = new Client({
    auth: "fake-test-token-never-real",
    notionVersion: NOTION_API_VERSION,
    fetch: auditTransport({
      upstream: async () => {
        calls++;
        return Response.json({});
      },
      sleep: noSleep,
    }),
    retry: false,
    logger: () => undefined,
  });
  const writes = [
    () => client.pages.create({ parent: { page_id: id(1) }, properties: {} }),
    () => client.pages.update({ page_id: id(1), in_trash: true }),
    () => client.blocks.children.append({ block_id: id(1), children: [] }),
    () =>
      client.blocks.update({ block_id: id(1), paragraph: { rich_text: [] } }),
    () => client.blocks.delete({ block_id: id(1) }),
    () =>
      client.databases.create({ parent: { type: "page_id", page_id: id(1) } }),
    () => client.databases.update({ database_id: id(1), title: [] }),
    () =>
      client.dataSources.create({
        parent: { type: "database_id", database_id: id(1) },
        properties: {},
      }),
    () => client.dataSources.update({ data_source_id: id(1), properties: {} }),
    () => client.comments.create({ parent: { page_id: id(1) }, rich_text: [] }),
    () => client.fileUploads.create({}),
    () => client.request({ method: "patch", path: `pages/${id(1)}`, body: {} }),
  ];
  for (const write of writes)
    await assert.rejects(
      write,
      (e) =>
        e instanceof PrivateError && e.code === "NOTION_AUDIT_WRITE_BLOCKED",
    );
  assert.equal(calls, 0);
});
test("page body reads, row queries, unrelated endpoints and SSRF are also blocked", async () => {
  let calls = 0;
  const guard = auditTransport({
    upstream: async () => {
      calls++;
      return Response.json({});
    },
    sleep: noSleep,
  });
  const client = new Client({
    auth: "fixture",
    notionVersion: NOTION_API_VERSION,
    fetch: guard,
    retry: false,
    logger: () => undefined,
  });
  for (const read of [
    () => client.blocks.children.list({ block_id: id(1) }),
    () => client.pages.retrieve({ page_id: id(1) }),
    () => client.dataSources.query({ data_source_id: id(1) }),
    () => client.users.me({}),
  ])
    await assert.rejects(read, /NOTION_AUDIT_WRITE_BLOCKED/);
  for (const url of [
    "https://evil.example/v1/search",
    "http://api.notion.com/v1/search",
    `https://api.notion.com/v1/data_sources/${id(1)}?x=1`,
    `https://api.notion.com/v1/databases/${id(1)}/extra`,
  ])
    await assert.rejects(
      () => guard(url, { method: "GET" }),
      /NOTION_AUDIT_WRITE_BLOCKED/,
    );
  await assert.rejects(
    () =>
      guard("https://api.notion.com/v1/search", {
        method: "POST",
        body: '{"page_size":100,"query":"unexpected"}',
      }),
    /NOTION_AUDIT_WRITE_BLOCKED/,
  );
  assert.equal(calls, 0);
});
test("SDK pins current API and permits only search and metadata retrieval", async () => {
  const calls: string[] = [];
  const client = new Client({
    auth: "fixture",
    notionVersion: NOTION_API_VERSION,
    fetch: auditTransport({
      upstream: async (input, init) => {
        assert.equal(
          new Headers(init?.headers).get("notion-version"),
          "2026-03-11",
        );
        calls.push(String(input));
        return Response.json(
          String(input).endsWith("/search")
            ? search([])
            : String(input).includes("data_sources")
              ? source()
              : database(),
        );
      },
      sleep: noSleep,
    }),
    retry: false,
    logger: () => undefined,
  });
  await client.search({ page_size: 100 });
  await client.dataSources.retrieve({ data_source_id: id(1) });
  await client.databases.retrieve({ database_id: id(99) });
  assert.equal(calls.length, 3);
  assert.deepEqual(Object.keys(createReadOnlyNotion("fixture")).sort(), [
    "retrieveDatabase",
    "retrieveSource",
    "search",
  ]);
});
test("429 Retry-After is respected and large waits are deferred rather than shortened", async () => {
  const waits: number[] = [];
  let calls = 0;
  let clock = 1000;
  const guard = auditTransport({
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    upstream: async () =>
      ++calls === 1
        ? new Response("{}", { status: 429, headers: { "Retry-After": "2" } })
        : Response.json(search([])),
  });
  await guard("https://api.notion.com/v1/search", {
    method: "POST",
    body: '{"page_size":100}',
    headers: { "Notion-Version": NOTION_API_VERSION },
  });
  assert.equal(calls, 2);
  assert.ok(waits.includes(2000));
  const limited = auditTransport({
    sleep: noSleep,
    upstream: async () =>
      new Response("{}", { status: 429, headers: { "Retry-After": "120" } }),
  });
  await assert.rejects(
    () =>
      limited("https://api.notion.com/v1/search", {
        method: "POST",
        body: '{"page_size":100}',
        headers: { "Notion-Version": NOTION_API_VERSION },
      }),
    (e) => e instanceof PrivateError && e.retryAfter === 120,
  );
});
test("retries are bounded for 5xx and network errors are sanitized", async () => {
  let calls = 0;
  const guard = auditTransport({
    sleep: noSleep,
    upstream: async () => {
      calls++;
      return new Response("{}", { status: 503 });
    },
  });
  await assert.rejects(
    () =>
      guard(`https://api.notion.com/v1/databases/${id(99)}`, {
        headers: { "Notion-Version": NOTION_API_VERSION },
      }),
    /NOTION_TEMPORARILY_UNAVAILABLE/,
  );
  assert.equal(calls, 3);
  const network = auditTransport({
    sleep: noSleep,
    upstream: async () => {
      throw Error("SECRET_TOKEN");
    },
  });
  await assert.rejects(
    () =>
      network(`https://api.notion.com/v1/databases/${id(99)}`, {
        headers: { "Notion-Version": NOTION_API_VERSION },
      }),
    /NOTION_NETWORK_UNAVAILABLE/,
  );
});
test("metadata discovery follows pagination, inventories container versus sources, and strips content", async () => {
  const mock = mockNotion();
  let job = startDiscovery();
  while (job.status === "running") job = await discoveryStep(job, mock.client);
  assert.equal(job.status, "complete");
  assert.ok(mock.calls.includes("search:next"));
  assert.equal(job.items.filter((i) => i.kind === "data_source").length, 2);
  assert.equal(job.items.filter((i) => i.kind === "database").length, 1);
  assert.equal(job.items.filter((i) => i.kind === "page").length, 1);
  const relation = job.items
    .find((i) => i.id === id(1))!
    .schema.find((p) => p.type === "relation")!;
  assert.equal(relation.relation!.dataSourceId, id(2));
  assert.equal(relation.relation!.databaseId, id(100));
  assert.ok(!JSON.stringify(job).includes("SENSITIVE_VALUE"));
  assert.ok(!JSON.stringify(job).includes("DO_NOT_STORE_DESCRIPTION"));
  assert.equal(mock.calls.filter((c) => c === `source:${id(1)}`).length, 1);
});
test("inaccessible sibling sources remain excluded and do not trigger relation traversal", async () => {
  const mock = mockNotion();
  mock.client.search = async () => search([source()]);
  mock.client.retrieveSource = async (sourceId) => {
    if (sourceId === id(2))
      throw new (await import("@notionhq/client")).APIResponseError({
        code: APIErrorCode.ObjectNotFound,
        status: 404,
        message: "PRIVATE CONTENT",
        headers: new Headers(),
        rawBodyText: "SECRET",
        additional_data: undefined,
        request_id: undefined,
      });
    return source();
  };
  let job = startDiscovery();
  while (job.status === "running") job = await discoveryStep(job, mock.client);
  assert.equal(job.status, "partial");
  assert.equal(job.items.filter((i) => i.kind === "data_source").length, 1);
  assert.ok(
    job.warnings.some((w) => w.code === "INACCESSIBLE" && w.id === id(2)),
  );
  assert.ok(!mock.calls.includes(`database:${id(100)}`));
  assert.ok(!JSON.stringify(auditView(job)).includes("PRIVATE CONTENT"));
});
test("repeated cursors and Notion incomplete search produce explicitly partial reports", async () => {
  const mock = mockNotion();
  mock.client.search = async () => ({
    ...search([page()], "repeat"),
    request_status: {
      type: "incomplete",
      incomplete_reason: "query_result_limit_reached",
    },
  });
  let job = startDiscovery();
  while (job.status === "running") job = await discoveryStep(job, mock.client);
  assert.equal(job.status, "partial");
  assert.ok(job.warnings.some((w) => w.code === "CURSOR_INVALID"));
  assert.ok(job.warnings.some((w) => w.code === "SEARCH_INCOMPLETE"));
  assert.match(auditView(job).scope, /ليس مسحًا كاملًا/);
});
test("rate-limited batch persists progress and prevents early resumption", async () => {
  const mock = mockNotion();
  mock.client.search = async () => {
    throw new PrivateError("NOTION_RATE_LIMITED", 429, 120);
  };
  const now = Date.now();
  const job = await discoveryStep(startDiscovery(), mock.client, () => now);
  assert.equal(job.status, "running");
  assert.equal(Date.parse(job.retryAt!), now + 120000);
  await assert.rejects(
    () => discoveryStep(job, mock.client, () => now),
    /NOTION_RATE_LIMITED/,
  );
});
test("inventory size limit reports partial coverage instead of claiming a workspace scan", async () => {
  const mock = mockNotion();
  const job = startDiscovery();
  job.items = Array.from({ length: INVENTORY_LIMIT }, (_, n) => ({
    id: id(n),
    kind: "page",
    title: "fixture",
    parentId: null,
    createdAt: null,
    editedAt: null,
    schema: [],
    verified: true,
  }));
  const next = await discoveryStep(job, mock.client);
  assert.equal(next.status, "partial");
  assert.equal(mock.calls.length, 0);
  assert.ok(next.warnings.some((w) => w.code === "LIMIT_REACHED"));
});
test("duplicate structures are suggestions only and ambiguous mappings require manual choice", async () => {
  const mock = mockNotion();
  let job = startDiscovery();
  while (job.status === "running") job = await discoveryStep(job, mock.client);
  const before = JSON.stringify(job);
  const report = auditView(job);
  assert.ok(report.duplicates.some((d) => d.reason === "schema"));
  assert.equal(
    report.suggestions.find((s) => s.sourceId === id(1))?.area,
    "reading",
  );
  assert.equal(JSON.stringify(job), before);
  job.items[0].title = "وزارة الصحة";
  const v = auditView(job);
  assert.ok(v.scope.includes("خارج هذا الجرد"));
});
test("mapping approval accepts only verified data sources and leaves Notion and old mappings untouched", async () => {
  const mock = mockNotion();
  let job = startDiscovery();
  while (job.status === "running") job = await discoveryStep(job, mock.client);
  const before = JSON.stringify(job);
  const old: Mapping[] = [
    {
      sourceId: id(500),
      area: "health",
      aiIngestion: false,
      approvedAt: "old",
      reportId: "old",
    },
  ];
  const next = approveMappings(
    job,
    old,
    [{ sourceId: id(1), area: "reading", aiIngestion: true }],
    job.id,
    job.revision,
    true,
  );
  assert.equal(next.length, 2);
  assert.equal(next[1].aiIngestion, false);
  assert.deepEqual(next[0], old[0]);
  assert.equal(JSON.stringify(job), before);
  for (const input of [
    [{ sourceId: id(10), area: "life" }],
    [{ sourceId: id(999), area: "life" }],
    [{ sourceId: id(1), area: "unknown" }],
    [
      { sourceId: id(1), area: "life" },
      { sourceId: id(1), area: "health" },
    ],
  ])
    assert.throws(
      () => approveMappings(job, [], input, job.id, job.revision, true),
      /INVALID_MAPPING/,
    );
  assert.throws(
    () => approveMappings(job, [], [], job.id, job.revision, false),
    /MAPPING_REVIEW_REQUIRED/,
  );
  assert.throws(
    () => approveMappings(job, [], [], job.id, 0, true),
    /REPORT_CHANGED/,
  );
  for (const area of ["ministry", "health", "reading"] as const)
    assert.equal(canIngestNotionIntoAi({ ...next[1], area }), false);
});

test("page-size overflow at the inventory boundary never exceeds the metadata cap", async () => {
  const mock = mockNotion();
  const job = startDiscovery();
  job.items = Array.from({ length: 999 }, (_, n) => ({
    id: id(n),
    kind: "page",
    title: "fixture",
    parentId: null,
    createdAt: null,
    editedAt: null,
    schema: [],
    verified: true,
  }));
  mock.client.search = async () =>
    search(
      Array.from({ length: 100 }, (_, n) => ({ ...page(), id: id(n + 2000) })),
    );
  const next = await discoveryStep(job, mock.client);
  assert.equal(next.items.length, 1000);
  assert.equal(next.status, "partial");
  assert.ok(next.warnings.some((w) => w.code === "LIMIT_REACHED"));
});

test("relation IDs survive a schema that omits the optional relation discriminator", async () => {
  const mock = mockNotion();
  mock.client.search = async () => search([source()]);
  mock.client.retrieveSource = async () => {
    const value = source();
    const property = value.properties.Projects;
    if (property.type === "relation") delete property.relation.type;
    return value;
  };
  mock.client.retrieveDatabase = async () => database([1]);
  let job = startDiscovery();
  while (job.status === "running") job = await discoveryStep(job, mock.client);
  assert.equal(
    job.items
      .find((i) => i.kind === "data_source")
      ?.schema.find((p) => p.type === "relation")?.relation?.syncedPropertyId,
    "related",
  );
});
