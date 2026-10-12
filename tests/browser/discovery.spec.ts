import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const sourceId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const report = {
  id: "fixture-report",
  revision: 2,
  startedAt: "2026-10-11T10:00:00Z",
  updatedAt: "2026-10-11T11:00:00Z",
  status: "complete",
  retryAt: null,
  scope:
    "تقرير اختبار توضيحي فقط. ليس مسحًا كاملًا لمساحة العمل؛ لا يحتوي على بيانات حقيقية.",
  warnings: [],
  items: [sourceId, secondId].map((id, i) => ({
    id,
    kind: "data_source",
    title: i ? "دورات تجريبية" : "مكتبة قراءة تجريبية",
    parentId: "00000000-0000-4000-8000-000000000099",
    createdAt: "2026-10-11T10:00:00Z",
    editedAt: "2026-10-11T11:00:00Z",
    verified: true,
    schema: [
      { id: "title", name: "الاسم", type: "title" },
      {
        id: "relation",
        name: "مشروع",
        type: "relation",
        relation: {
          dataSourceId: secondId,
          databaseId: null,
          syncedPropertyId: null,
        },
      },
    ],
  })),
  suggestions: [
    {
      sourceId,
      area: "reading",
      reason: "اقتراح محلي من اسم المصدر فقط؛ يحتاج مراجعتك.",
    },
    { sourceId: secondId, area: "courses", reason: "اقتراح تجريبي محلي" },
  ],
  duplicates: [{ ids: [sourceId, secondId], reason: "schema" }],
};
test("unconfigured private page fails closed and does not expose a Notion report", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/notion/report", {
    headers: { Cookie: "" },
  });
  expect([401, 503]).toContain(response.status());
  expect(response.headers()["cache-control"]).toContain("no-store");
  const result = await response.json();
  expect(result.report).toBeUndefined();
  await page.goto("/discovery");
  await expect(
    page.getByRole("heading", { name: "اكتشاف Notion الخاص" }),
  ).toBeVisible();
  const start = page.getByRole("button", { name: "بدء الجرد للقراءة فقط" });
  // Both missing integration configuration and unavailable private storage fail closed.
  // The isolated protocol fixture can return the latter during pool reconnection.
  await expect(
    start.or(page.getByRole("heading", { name: "الإعداد الخاص مطلوب" })),
  ).toBeVisible();
  // The page may transition from disabled controls to a fail-closed storage error.
  // Neither state may offer an enabled scan, even during that transition.
  await expect(start.and(page.locator(":enabled"))).toHaveCount(0);
  await expect(page.locator(".inventory-item")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const scan = await request.post("/api/notion/start", {
    headers: { Origin: "http://localhost:3100" },
    data: { acknowledged: true },
  });
  expect([401, 503]).toContain(scan.status());
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("authenticated report UI requires explicit mapping approval and clears private data on logout (mock API)", async ({
  page,
}) => {
  let authenticated = true; // Server page already verified the real fixture owner cookie.
  let saved: unknown[] = [];
  let savedCalls = 0;
  await page.route("**/api/private/**", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1);
    if (action === "session")
      return route.fulfill({ json: { authenticated, ready: true } });
    if (action === "login") {
      authenticated = true;
      return route.fulfill({ json: { authenticated: true } });
    }
    if (action === "logout") {
      authenticated = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
  await page.route("**/api/notion/**", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1);
    if (!authenticated)
      return route.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } });
    if (action === "status")
      return route.fulfill({ json: { configured: true, mode: "read-only" } });
    if (action === "report")
      return route.fulfill({ json: { report, mappings: saved } });
    if (action === "audit") return route.fulfill({ json: { entries: [] } });
    if (action === "mappings") {
      const body = route.request().postDataJSON();
      expect(body.approved).toBe(true);
      expect(body.reportId).toBe(report.id);
      saved = body.mappings.map((m: { sourceId: string; area: string }) => ({
        ...m,
        aiIngestion: false,
        approvedAt: report.updatedAt,
        reportId: report.id,
      }));
      savedCalls++;
      return route.fulfill({ json: { mappings: saved } });
    }
    return route.fulfill({ json: { report } });
  });
  await page.goto("/discovery");
  await expect(
    page.getByRole("heading", { name: "تقرير الجرد المرئي" }),
  ).toBeVisible();
  const save = page.getByRole("button", { name: "حفظ الربط المعتمد داخليًا" });
  await expect(save).toBeDisabled();
  await page.locator(".mapping-row").first().getByRole("checkbox").check();
  await expect(save).toBeDisabled();
  await page.getByRole("checkbox", { name: /راجعت المصادر المحددة/ }).check();
  await save.click();
  expect(savedCalls).toBe(1);
  await expect(page.getByRole("status")).toContainText(
    "لم يُعدّل أي شيء في Notion",
  );
  await expect(
    page.getByRole("heading", { name: "هياكل قد تكون متشابهة" }),
  ).toBeVisible();
  await page.locator(".inventory-item").first().locator("summary").click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  mkdirSync("/tmp/madar-notion-screenshots", { recursive: true });
  await page.screenshot({
    path: "/tmp/madar-notion-screenshots/audit-fixture.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/madar-notion-screenshots/audit-mobile-fixture.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "خروج", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "مساحة خاصة بك وحدك" }),
  ).toBeVisible();
  await expect(page.locator(".inventory-item")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "الروابط المحفوظة داخليًا" }),
  ).toHaveCount(0);
});
