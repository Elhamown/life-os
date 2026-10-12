import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
test.use({ storageState: { cookies: [], origins: [] } });
test("one real owner login/logout protects all pages and private API data", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByText("حساب مالك واحد", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /تسجيل حساب|دعوة|فريق/ }),
  ).toHaveCount(0);
  mkdirSync("/tmp/madar-owner-screenshots", { recursive: true });
  await page.screenshot({
    path: "/tmp/madar-owner-screenshots/login.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("كلمة مرور المالك").fill("fixture-owner-password");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
  await expect(
    page.getByRole("heading", { name: "صباح الخير، إلهام" }),
  ).toBeVisible();
  const cookies = await context.cookies();
  const owner = cookies.find((c) => c.name === "madar-private-local");
  expect(owner?.httpOnly).toBe(true);
  expect(owner?.sameSite).toBe("Strict");
  await page.screenshot({
    path: "/tmp/madar-owner-screenshots/today.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/madar-owner-screenshots/mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "الخروج من مدار" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/sync");
  await expect(page).toHaveURL(/\/login\?next=/);
  for (const path of [
    "/api/notion/report",
    "/api/ai/status?spaceId=life",
    "/api/sync/status",
  ])
    expect(
      (await request.get(path, { headers: { Cookie: "" } })).status(),
    ).toBe(401);
});
test("CSRF and alternate-account payloads are rejected without creating sessions", async ({
  request,
}) => {
  for (const headers of [
    { Origin: "https://evil.example" },
    { Origin: "http://localhost:3100", "Sec-Fetch-Site": "same-site" },
  ] as Record<string, string>[])
    expect(
      (
        await request.post("/api/private/login", {
          headers,
          data: { password: "fixture-owner-password" },
        })
      ).status(),
    ).toBe(403);
  expect(
    (
      await request.post("/api/private/login", {
        headers: { Origin: "http://localhost:3100" },
        data: {
          password: "fixture-owner-password",
          userId: "other",
          role: "admin",
        },
      })
    ).status(),
  ).toBe(400);
  for (const route of ["signup", "invite", "teams", "users"])
    expect(
      (
        await request.post(`/api/private/${route}`, {
          headers: { Origin: "http://localhost:3100" },
          data: {},
        })
      ).status(),
    ).toBe(405);
});
test("loss of the owner session clears a previously rendered private dashboard", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.getByLabel("كلمة مرور المالك").fill("fixture-owner-password");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(
    page.getByRole("heading", { name: "صباح الخير، إلهام" }),
  ).toBeVisible();
  await context.clearCookies();
  // A concurrent session check can redirect before the synthetic focus completes.
  // Preserve the actual security assertions below; only accept navigation teardown.
  await page
    .evaluate(() => window.dispatchEvent(new Event("focus")))
    .catch((error) => {
      if (!String(error).includes("Execution context was destroyed"))
        throw error;
    });
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(
    page.getByRole("heading", { name: "صباح الخير، إلهام" }),
  ).toHaveCount(0);
});
test("switching AI area clears prior private drafts, context, text and consent", async ({
  page,
}) => {
  // Genuine owner authentication; synthetic configured provider responses only.
  await page.goto("/login");
  await page.getByLabel("كلمة مرور المالك").fill("fixture-owner-password");
  await page.getByRole("button", { name: "دخول آمن" }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
  await page.route("**/api/ai/status**", (r) => {
    const area = new URL(r.request().url()).searchParams.get("spaceId");
    return r.fulfill({
      json: {
        spaceId: area,
        configured: true,
        provider: "fixture.example",
        model: "fixture",
        transcriptionModel: "fixture",
        proposals:
          area === "stardust"
            ? [
                {
                  id: "fixture-private-draft",
                  kind: "note",
                  operation: "create",
                  spaceId: "stardust",
                  title: "مسودة ستاردست المعزولة",
                  details: "",
                  date: null,
                  time: null,
                  durationMinutes: null,
                  contextIds: [],
                  status: "pending",
                  createdAt: "2026-10-12T10:00:00Z",
                },
              ]
            : [],
        context: [],
      },
    });
  });
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await page.getByLabel("مجال الرسالة").selectOption("stardust");
  await expect(
    page.getByText("مسودة ستاردست المعزولة", { exact: true }),
  ).toBeVisible();
  await page.getByLabel(/أوافق على إرسال النص/).check();
  await page
    .getByRole("textbox", { name: "رسالتك للمساعد" })
    .fill("نص خاص بستاردست");
  await page.getByLabel("مجال الرسالة").selectOption("studio");
  await expect(
    page.getByText("مسودة ستاردست المعزولة", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/أوافق على إرسال النص/)).not.toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "رسالتك للمساعد" }),
  ).toHaveValue("");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
