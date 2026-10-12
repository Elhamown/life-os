import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const artifacts = "/tmp/madar-premium";
test("local fonts, inline capture, shared calendar records and reloadable views", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("neoArabic");
  await page.getByLabel("ما الذي يدور في بالك؟").fill("موعد خطوة تجريبية");
  await page
    .getByRole("button", { name: "أضف إلى الديمو", exact: true })
    .click();
  const nav = page.getByRole("navigation", {
    name: "التنقل الرئيسي",
    exact: true,
  });
  await nav.getByRole("button", { name: "التقويم", exact: true }).click();
  await expect(
    page.locator(".calendar-task").filter({ hasText: "موعد خطوة تجريبية" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "أسبوع", exact: true }).click();
  await expect(
    page.locator(".calendar-task").filter({ hasText: "موعد خطوة تجريبية" }),
  ).toHaveCount(1);
  await nav.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await expect(
    page.getByText("ملف Medium المرفق لاتيني فقط.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "إعدادات مدار." }),
  ).toBeVisible();
});
test("premium calendar/settings accessibility, mobile more menu and review screenshots", async ({
  page,
}) => {
  mkdirSync(artifacts, { recursive: true });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${artifacts}/today-light.png`,
    fullPage: true,
  });
  const nav = page.getByRole("navigation", {
    name: "التنقل الرئيسي",
    exact: true,
  });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("banner")
        .getByRole("button", { name: "تفعيل الوضع الداكن" })
        .click();
    for (const destination of ["التقويم", "الإعدادات"]) {
      await nav.getByRole("button", { name: destination, exact: true }).click();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: `${artifacts}/${destination === "التقويم" ? "calendar" : "settings"}-${theme}.png`,
        fullPage: true,
      });
    }
  }
  await nav.getByRole("button", { name: "اليوم", exact: true }).click();
  await page.screenshot({
    path: `${artifacts}/today-dark.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("navigation", { name: "التنقل على الجوال" });
  for (const control of await mobile.getByRole("button").all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await mobile.getByRole("button", { name: "المزيد من الأقسام" }).click();
  await expect(
    mobile.getByRole("link", { name: "اكتشاف Notion" }),
  ).toBeVisible();
  await mobile.getByRole("button", { name: "الإعدادات", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "إعدادات مدار." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile.getByRole("button", { name: "اليوم", exact: true }).click();
  await page.screenshot({
    path: `${artifacts}/today-mobile.png`,
    fullPage: true,
  });
});

test("synthetic discovery preview makes no Notion action requests and quick capture survives private navigation", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/notion/") && r.method() !== "GET")
      mutations.push(r.url());
  });
  await page.goto("/discovery");
  await page.getByRole("button", { name: "عرض مثال آمن" }).click();
  await expect(page.locator(".audit-preview-source")).toHaveCount(8);
  await expect(
    page.getByText("مثال بصري فقط:", { exact: false }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.getByRole("link", { name: "التقاط سريع", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/sync");
  await expect(
    page
      .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
      .getByRole("link", { name: "مركز المزامنة" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText("المزامنة غير مفعّلة", { exact: true }),
  ).toBeVisible();
});
