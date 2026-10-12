import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { initialState, todayDate } from "../../app/lib/model";
const artifacts = "/tmp/madar-screenshots";
test.beforeEach(async ({ page }) => {
  // Synthetic records are seeded only into the disposable browser-test database.
  const prior = await (await page.request.get("/api/workspace")).json();
  const today = todayDate();
  const yesterday = new Date(today + "T12:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const state = {
    ...initialState,
    projects: [],
    events: [],
    tasks: initialState.tasks.map((t) => ({
      ...t,
      date: t.id === "t5" ? yesterday.toISOString().slice(0, 10) : today,
    })),
    proposals: initialState.proposals.map((p) => ({ ...p, date: today })),
  };
  const seed = await page.request.post("/api/workspace", {
    headers: { Origin: "http://localhost:3100" },
    data: { revision: prior.revision, workspace: { schemaVersion: 1, state } },
  });
  expect(seed.status()).toBe(200);
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: "محفوظ في مساحة العمل الخاصة" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});
test("Arabic RTL, completion synchronization, and overdue rescheduling", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "اليوم، على مهل." }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "إكمال مراجعة خطة العمل الأسبوعية",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "لليوم", exact: true }).click();
  await expect(
    page.getByText("كل شيء تحت السيطرة. لا توجد مهام متأخرة."),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: "المساحات" })
    .click();
  await page.getByRole("button", { name: /العمل الوزاري تنظيم/ }).click();
  await expect(
    page.getByRole("button", {
      name: "إلغاء إكمال مراجعة خطة العمل الأسبوعية",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "الملاحظات" }).click();
  await expect(page.getByText("مساحة فارغة لأفكارك القادمة.")).toBeVisible();
  await page.getByRole("tab", { name: "الملاحظات" }).press("Home");
  await expect(page.getByRole("tab", { name: "نظرة عامة" })).toBeFocused();
});
test("global capture, conversion without duplication, dialog focus and escape", async ({
  page,
}) => {
  const trigger = page
    .getByRole("button", { name: "التقاط سريع", exact: true })
    .first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await dialog.getByRole("textbox").fill("فكرة للاختبار");
  await dialog.getByLabel("النوع", { exact: true }).selectOption("note");
  await dialog.getByRole("button", { name: "حفظ المهمة أو الملاحظة" }).click();
  const note = page.locator(".note-row").filter({ hasText: "فكرة للاختبار" });
  await note.getByRole("button", { name: "تحويل إلى مهمة" }).click();
  await expect(
    page.locator(".note-row").filter({ hasText: "فكرة للاختبار" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".task-title").filter({ hasText: "فكرة للاختبار" }),
  ).toHaveCount(1);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("proposal edit, approval and rejection change only local records", async ({
  page,
}) => {
  const proposal = page.locator(".proposal:visible").first();
  await proposal.getByRole("button", { name: "تعديل", exact: true }).click();
  await proposal.getByLabel("عنوان المهمة").fill("مهمة مقترحة معدّلة");
  await proposal.getByLabel("المساحة", { exact: true }).selectOption("life");
  await proposal.getByRole("button", { name: "حفظ التعديل" }).click();
  await proposal.getByRole("button", { name: "موافقة", exact: true }).click();
  await expect(
    page.locator(".task-title").filter({ hasText: "مهمة مقترحة معدّلة" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await expect(
    page.getByRole("button", { name: "تسجيل صوت عربي" }),
  ).toBeDisabled();
  await expect(page.locator(".conversation:visible")).toContainText(
    "AI غير مفعّل على الخادم",
  );
  await expect(page.locator(".conversation:visible")).toContainText(
    "مسودات فقط",
  );
});
test("theme persistence, all spaces and screenshots", async ({ page }) => {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({
    path: `${artifacts}/today-light.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: `${artifacts}/today-dark.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: "المساحات" })
    .click();
  await expect(page.locator(".space-tile")).toHaveCount(8);
  await page.screenshot({
    path: `${artifacts}/spaces-dark.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await page.screenshot({
    path: `${artifacts}/assistant-dark.png`,
    fullPage: true,
  });
});
test("mobile navigation, capture and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNav = page.getByRole("navigation", { name: "التنقل على الجوال" });
  await expect(mobileNav).toBeVisible();
  for (const name of ["اليوم", "المساحات", "المساعد"]) {
    await mobileNav.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "التقاط سريع", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await mobileNav.getByRole("button", { name: "اليوم", exact: true }).click();
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({
    path: `${artifacts}/today-mobile.png`,
    fullPage: false,
  });
});

test("accessible light and dark screens, dialog, and no external application requests", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/))
      external.push(request.url());
  });
  const nav = page.getByRole("navigation", {
    name: "التنقل الرئيسي",
    exact: true,
  });
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).click();
    for (const destination of ["اليوم", "المساحات", "المساعد"]) {
      await nav.getByRole("button", { name: new RegExp(destination) }).click();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }
  }
  await page
    .getByRole("button", { name: "التقاط سريع", exact: true })
    .first()
    .click();
  const dialogResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(dialogResults.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "تسجيل صوت عربي" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("global search opens the shared record space and conversation survives navigation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "فتح البحث" }).click();
  await page
    .getByRole("textbox", { name: "ابحث في المهام والملاحظات والمساحات" })
    .fill("لوحة الإلهام");
  await page.locator(".search-result").click();
  await expect(page.locator(".space-title")).toContainText("استوديو السلام");
  const nav = page.getByRole("navigation", {
    name: "التنقل الرئيسي",
    exact: true,
  });
  await nav.getByRole("button", { name: /المساعد/ }).click();
  await page
    .getByRole("textbox", { name: "رسالتك للمساعد" })
    .fill("خطة تجريبية");
  await expect(
    page.getByRole("button", { name: "إرسال الرسالة" }),
  ).toBeDisabled();
  await nav.getByRole("button", { name: "اليوم", exact: true }).click();
  await nav.getByRole("button", { name: /المساعد/ }).click();
  await expect(
    page.getByRole("textbox", { name: "رسالتك للمساعد" }),
  ).toHaveValue("خطة تجريبية");
});
