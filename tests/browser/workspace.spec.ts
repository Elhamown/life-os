import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function open(page: import("@playwright/test").Page, name: string) {
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
async function saved(page: import("@playwright/test").Page) {
  try {
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "محفوظ في مساحة العمل الخاصة" }),
    ).toBeVisible();
  } catch (error) {
    const response = await page.request.get("/api/workspace");
    const body = await response.json();
    console.log(
      "Workspace fixture diagnostic",
      response.status(),
      body.error,
      body.revision,
    );
    throw error;
  }
}
test("real task, note and settings survive refresh; project linking and deletion remain coherent", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await open(page, "المشاريع");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await page.getByLabel("العنوان", { exact: true }).fill("مشروع اختبار دائم");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await open(page, "المهام");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await page.getByLabel("العنوان", { exact: true }).fill("مهمة اختبار دائمة");
  await page
    .getByLabel("المشروع", { exact: true })
    .selectOption({ label: "مشروع اختبار دائم" });
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await open(page, "الملاحظات");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await page.getByLabel("العنوان", { exact: true }).fill("ملاحظة اختبار دائمة");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await open(page, "الإعدادات");
  await page.getByRole("combobox").selectOption("monday");
  await saved(page);
  await page.reload();
  await saved(page);
  await open(page, "الإعدادات");
  await expect(page.getByRole("combobox")).toHaveValue("monday");
  await open(page, "المهام");
  await expect(
    page.getByText("مهمة اختبار دائمة", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "إكمال مهمة اختبار دائمة", exact: true })
    .click();
  await saved(page);
  await open(page, "المشاريع");
  await expect(
    page.getByText("1 / 1 مهام مكتملة", { exact: true }),
  ).toBeVisible();
  await open(page, "الملاحظات");
  await expect(
    page.getByText("ملاحظة اختبار دائمة", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تعديل ملاحظة اختبار دائمة" }).click();
  await page.getByLabel("العنوان", { exact: true }).fill("ملاحظة معدّلة");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await open(page, "الملاحظات");
  await expect(page.getByText("ملاحظة معدّلة", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "حذف ملاحظة معدّلة" }).click();
  await saved(page);
  await expect(page.getByText("ملاحظة معدّلة", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/madar-workspace-desktop.png",
    fullPage: true,
  });
});
test("two tabs cannot silently overwrite workspace; recovery download retains pending edits", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await saved(page);
  const other = await context.newPage();
  await other.goto("/");
  await saved(other);
  await open(page, "الملاحظات");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await page.getByLabel("العنوان", { exact: true }).fill("تغيير الجهاز الأول");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await open(other, "الملاحظات");
  await other.getByRole("button", { name: "إضافة", exact: true }).click();
  await other
    .getByLabel("العنوان", { exact: true })
    .fill("تغيير الجهاز الثاني");
  await other.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(other.getByRole("status")).toContainText(
    "تغيّرت البيانات على جهاز آخر",
  );
  const download = other.waitForEvent("download");
  await other.getByRole("button", { name: "تنزيل نسخة للاسترداد" }).click();
  expect((await download).suggestedFilename()).toBe(
    "madar-workspace-recovery.json",
  );
  await page.reload();
  await saved(page);
  await open(page, "الملاحظات");
  await expect(
    page.getByText("تغيير الجهاز الأول", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("تغيير الجهاز الثاني", { exact: true }),
  ).toHaveCount(0);
});
test("mobile workspace fits viewport and remains accessible; anonymous API stays closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await saved(page);
  await page
    .getByRole("navigation", { name: "التنقل على الجوال" })
    .getByRole("button", { name: "المهام", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "المهام", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({
    path: "/tmp/madar-workspace-mobile.png",
    fullPage: true,
  });
  const unauthorized = await page.request.get("/api/workspace", {
    headers: { Cookie: "" },
  });
  expect(unauthorized.status()).toBe(401);
});

test("custom spaces, habits, goals and calendar events restore from the database", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  await open(page, "المساحات");
  await page
    .getByRole("textbox", { name: "اسم المساحة الجديدة" })
    .fill("المالية الشخصية");
  await page.getByRole("button", { name: "إضافة مساحة", exact: true }).click();
  await saved(page);
  await open(page, "المهام");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await page.getByLabel("العنوان", { exact: true }).fill("مراجعة الميزانية");
  await page
    .getByRole("combobox", { name: "المساحة", exact: true })
    .selectOption({ label: "المالية الشخصية" });
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await open(page, "العادات والأهداف");
  await page
    .getByLabel("العنوان", { exact: true })
    .fill("قراءة يومية للاختبار");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await saved(page);
  await page
    .getByRole("checkbox", { name: "قراءة يومية للاختبار", exact: true })
    .check();
  await saved(page);
  await page
    .getByRole("combobox", { name: "النوع", exact: true })
    .selectOption("goal");
  await page.getByLabel("العنوان", { exact: true }).fill("إكمال دورة للاختبار");
  await page.getByLabel("عدد الخطوات المطلوبة").fill("5");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await saved(page);
  await page
    .getByRole("spinbutton", {
      name: "الخطوات المكتملة لـ إكمال دورة للاختبار",
    })
    .fill("2");
  await saved(page);
  await open(page, "التقويم");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await page
    .getByLabel("العنوان", { exact: true })
    .fill("موعد متابعة للاختبار");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await open(page, "العادات والأهداف");
  await expect(
    page.getByRole("checkbox", { name: "قراءة يومية للاختبار", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("spinbutton", {
      name: "الخطوات المكتملة لـ إكمال دورة للاختبار",
    }),
  ).toHaveValue("2");
  await open(page, "التقويم");
  await expect(
    page.getByRole("heading", { name: "موعد متابعة للاختبار", exact: true }),
  ).toBeVisible();
  await open(page, "المهام");
  await expect(
    page.getByText("مراجعة الميزانية", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".record-row").filter({ hasText: "مراجعة الميزانية" }),
  ).toContainText("المالية الشخصية");
});
