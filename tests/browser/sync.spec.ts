import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type {
  SyncAction,
  SyncLedger,
  SourceScope,
} from "../../app/lib/sync/types";
import { mkdirSync } from "node:fs";
const sourceId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000003";
const columns = {
  title: "title",
  recordId: "stable",
  details: null,
  date: null,
  kind: null,
  duration: null,
};
const scope: SourceScope = {
  sourceId,
  area: "life",
  mode: "test",
  columns,
  schemaHash: "fixture",
  reportId: "fixture-report",
  revision: 1,
  approvedAt: "2026-10-11T00:00:00Z",
};
const action: SyncAction = {
  connectionHash: "fixture-only",
  id: "fixture-action",
  version: 1,
  recordId,
  sourceId,
  pageId: null,
  operation: "create",
  origin: "manual",
  proposalId: null,
  scope,
  fields: {
    title: "اختبار مدار · مقترح معزول",
    details: null,
    date: null,
    kind: "note",
    durationMinutes: null,
  },
  payload: {
    title: {
      title: [{ type: "text", text: { content: "اختبار مدار · مقترح معزول" } }],
    },
    stable: { rich_text: [{ type: "text", text: { content: recordId } }] },
  },
  digest: "fixture-exact-digest",
  baseline: null,
  state: "pending",
  createdAt: "2026-10-11T00:00:00Z",
  approvedAt: null,
  lastSuccessAt: null,
  retryAt: null,
  attempts: 0,
  writeDispatched: false,
  error: null,
  current: null,
  candidates: [],
  history: [
    {
      at: "2026-10-11T00:00:00Z",
      event: "prepared",
      digest: "fixture-exact-digest",
    },
  ],
};
test("site requires actual persisted authentication for dashboard, discovery, sync and RSC", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    for (const path of ["/", "/discovery", "/sync"]) {
      const r = await context.request.get(`http://localhost:3100${path}`);
      expect(new URL(r.url()).pathname).toBe("/login");
      expect(r.headers()["cache-control"]).toContain("no-store");
      const html = await r.text();
      expect(html).not.toContain("مراجعة خطة العمل الأسبوعية");
      expect(html).not.toContain("اختبار مدار · مقترح معزول");
    }
    const r = await context.request.get("http://localhost:3100/?_rsc=fixture", {
      headers: { RSC: "1" },
    });
    expect((await r.text()).includes("اليوم، على مهل.")).toBe(false);
    expect(
      (
        await context.request.get("http://localhost:3100/api/sync/status")
      ).status(),
    ).toBe(401);
    const page = await context.newPage();
    await page.goto("http://localhost:3100/login");
    await expect(page.getByLabel("كلمة مرور المالك")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "مدار، مساحتك الخاصة." }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await context.close();
  }
});
test("sync review displays exact target/payload, requires consent and quarantines conflicts", async ({
  page,
}) => {
  let ledger: SyncLedger = {
    revision: 1,
    scopes: [scope],
    actions: [action],
    bindings: {},
    lastSuccessAt: null,
    testEvidence: null,
  };
  let writes = 0;
  await page.route("**/api/sync/status", (r) =>
    r.fulfill({
      json: {
        configured: true,
        testPassed: false,
        ledger,
        reportId: "fixture-report",
        reportRevision: 1,
        sources: [
          {
            id: sourceId,
            title: "قاعدة اختبار منفصلة",
            area: "life",
            mode: "test",
            schema: [
              { id: "title", name: "العنوان", type: "title" },
              { id: "stable", name: "معرّف مدار", type: "rich_text" },
            ],
          },
        ],
        aiProposals: [],
      },
    }),
  );
  await page.route("**/api/sync/execute", (r) => {
    const b = r.request().postDataJSON();
    expect(b.approved).toBe(true);
    expect(b.digest).toBe(action.digest);
    expect(b.version).toBe(1);
    writes++;
    ledger = {
      ...ledger,
      revision: 2,
      actions: [
        {
          ...action,
          version: 2,
          state: "conflict",
          error: "SYNC_DUPLICATE_IDS",
          candidates: [
            "00000000-0000-4000-8000-000000000004",
            "00000000-0000-4000-8000-000000000005",
          ],
          history: [
            ...action.history,
            {
              at: "2026-10-11T00:00:01Z",
              event: "conflict",
              digest: action.digest,
            },
          ],
        },
      ],
    };
    return r.fulfill({ json: { ledger, action: ledger.actions[0] } });
  });
  await page.goto("/sync");
  await expect(
    page.getByRole("heading", { name: "مزامنة Notion، بقرار واضح." }),
  ).toBeVisible();
  const card = page
    .locator(".sync-panel")
    .filter({ has: page.getByRole("heading", { name: action.fields.title }) });
  await expect(card).toContainText(sourceId);
  await expect(card).toContainText(recordId);
  await expect(card.locator("pre").first()).toContainText("data_source_id");
  await expect(
    card.getByRole("button", { name: "موافقة وتنفيذ هذا الإجراء" }),
  ).toBeDisabled();
  expect(writes).toBe(0);
  await card.getByLabel(/أوافق على تنفيذ الهدف والحمولة/).check();
  await card.getByRole("button", { name: "موافقة وتنفيذ هذا الإجراء" }).click();
  await expect(card).toContainText("تعارض يتطلب مراجعة");
  await expect(
    card.getByRole("button", { name: "موافقة وتنفيذ هذا الإجراء" }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  await page
    .getByRole("combobox", { name: "مصدر Notion", exact: true })
    .selectOption(sourceId);
  await expect(
    page.getByRole("button", { name: "اعتماد نطاق الكتابة" }),
  ).toBeDisabled();
  await page.getByLabel(/أوافق على الكتابة في هذا المصدر/).check();
  await expect(
    page.getByRole("button", { name: "اعتماد نطاق الكتابة" }),
  ).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  mkdirSync("/tmp/madar-sync-screenshots", { recursive: true });
  await page.screenshot({
    path: "/tmp/madar-sync-screenshots/sync-fixture.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/madar-sync-screenshots/sync-mobile-fixture.png",
    fullPage: true,
  });
});
test("sync unknown outcomes offer read-only reconciliation rather than a retry write", async ({
  page,
}) => {
  let unknown: SyncAction = {
    ...action,
    state: "uncertain",
    version: 2,
    writeDispatched: true,
    error: "NOTION_NETWORK_UNAVAILABLE",
    history: [
      ...action.history,
      { at: "2026-10-11T00:00:01Z", event: "uncertain", digest: action.digest },
    ],
  };
  let reads = 0;
  const status = () => ({
    configured: true,
    testPassed: false,
    ledger: {
      revision: 1,
      scopes: [scope],
      actions: [unknown],
      bindings: {},
      lastSuccessAt: null,
      testEvidence: null,
    },
    sources: [],
    aiProposals: [],
  });
  await page.route("**/api/sync/status", (r) => r.fulfill({ json: status() }));
  await page.route("**/api/sync/recover", (r) => {
    reads++;
    expect(r.request().postDataJSON().approved).toBe(true);
    unknown = { ...unknown, state: "succeeded", version: 3, error: "" };
    return r.fulfill({ json: { ledger: status().ledger, action: unknown } });
  });
  await page.goto("/sync");
  await expect(
    page.getByRole("button", { name: "إعادة محاولة معتمدة" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "موافقة وتنفيذ هذا الإجراء" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "تحقق من النتيجة دون كتابة" }).click();
  await expect(
    page.getByText("تم التحقق من النجاح", { exact: true }),
  ).toBeVisible();
  expect(reads).toBe(1);
});
