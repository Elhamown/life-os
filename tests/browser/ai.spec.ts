import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
test.use({
  launchOptions: {
    executablePath: process.env.MADAR_CHROMIUM_PATH || undefined,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
const proposal = {
  id: "fixture-ai-1",
  kind: "task",
  operation: "create",
  spaceId: "studies",
  title: "مراجعة الفصل",
  date: "2026-10-11",
  time: null,
  durationMinutes: null,
  details: "مسودة تجريبية للاختبار",
  contextIds: [],
  status: "pending",
  createdAt: "2026-10-11T00:00:00Z",
};
const item = {
  id: "actual-fixture",
  kind: "task",
  spaceId: "studies",
  title: "مهمة مؤكدة للاختبار",
  date: "2026-10-11",
  time: null,
  durationMinutes: null,
};
test("authenticated assistant: structured drafts, explicit edit/approval and grounded planning", async ({
  page,
}) => {
  let proposals: (typeof proposal)[] = [];
  let context: (typeof item)[] = [];
  let providerCalls = 0;
  let approvedTitle = "";
  await page.route("**/api/private/session", (r) =>
    r.fulfill({ json: { authenticated: true, ready: true } }),
  );
  await page.route("**/api/ai/status**", (r) =>
    r.fulfill({
      json: {
        configured: true,
        mode: "draft-only",
        provider: "fixture.example",
        model: "fixture",
        transcriptionModel: "fixture",
        context,
        proposals,
      },
    }),
  );
  await page.route("**/api/ai/propose", (r) => {
    providerCalls++;
    const body = r.request().postDataJSON();
    if (body.planning)
      return r.fulfill({
        json: {
          proposals: [],
          plan: context,
          message: "ترتيب سجلات مؤكدة فقط",
          mode: "draft-only",
        },
      });
    proposals = [proposal];
    return r.fulfill({
      json: {
        proposals,
        plan: [],
        message: "راجع المسودة قبل الاعتماد",
        mode: "draft-only",
      },
    });
  });
  await page.route("**/api/ai/decision", (r) => {
    const b = r.request().postDataJSON();
    approvedTitle = b.fields.title;
    proposals = [{ ...proposal, ...b.fields, status: b.decision }];
    return r.fulfill({ json: { proposal: proposals[0], mode: "draft-only" } });
  });
  await page.route("**/api/ai/context", (r) => {
    const b = r.request().postDataJSON();
    expect(b.confirmedActual).toBe(true);
    expect(b.consent).toBe(true);
    context = b.items;
    return r.fulfill({ json: { context } });
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await expect(
    page.getByRole("button", { name: "إرسال الرسالة" }),
  ).toBeDisabled();
  await page.getByLabel(/أوافق على إرسال النص/).check();
  await page
    .getByRole("textbox", { name: "رسالتك للمساعد" })
    .fill("أضف مهمة مراجعة");
  await page.getByRole("button", { name: "إرسال الرسالة" }).click();
  const card = page.locator(".ai-proposal");
  await expect(card).toContainText("مسودة فقط");
  await expect(card).toContainText("الوجهة: الدراسة");
  expect(approvedTitle).toBe("");
  await card.getByRole("button", { name: "تعديل المقترح" }).click();
  await card
    .getByLabel("عنوان المقترح", { exact: true })
    .fill("عنوان بعد المراجعة");
  await card.getByRole("button", { name: "اعتماد كمسودة" }).click();
  await expect(card).toContainText("لم تُرسل إلى Notion");
  expect(approvedTitle).toBe("عنوان بعد المراجعة");
  expect(providerCalls).toBe(1);
  await page.locator(".ai-context summary").click();
  await page.getByLabel("عنوان السجل المؤكد").fill(item.title);
  await page.getByLabel("تاريخ السجل المؤكد").fill(item.date);
  await page.getByRole("button", { name: "أضف للسياق المراد حفظه" }).click();
  await expect(
    page.getByRole("button", { name: "تسجيل صوت عربي" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "حفظ السياق المؤكد" }),
  ).toBeDisabled();
  await page.getByLabel(/هذه سجلات حقيقية/).check();
  await page.getByRole("button", { name: "حفظ السياق المؤكد" }).click();
  await expect(page.locator(".messages")).toContainText(
    "حُفظ سياق التخطيط الداخلي",
  );
  await expect(
    page.getByRole("button", { name: "تسجيل صوت عربي" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "رتّب أولويات اليوم" }).click();
  await expect(
    page.getByRole("heading", { name: "خطة مقترحة من سجلات مؤكدة" }),
  ).toBeVisible();
  await expect(page.locator(".conversation ol")).toContainText(item.title);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  mkdirSync("/tmp/madar-ai-screenshots", { recursive: true });
  await page.screenshot({
    path: "/tmp/madar-ai-screenshots/assistant-fixture.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/madar-ai-screenshots/assistant-mobile-fixture.png",
    fullPage: true,
  });
});
test("Arabic microphone: real browser recording, stop, transcription edit, submission and cancellation", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  let transcriptions = 0;
  let submitted = "";
  let recordings = 0;
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.defineProperty(window, "__micCalls", { value: 0, writable: true });
    navigator.mediaDevices.getUserMedia = async (c) => {
      (window as unknown as { __micCalls: number }).__micCalls++;
      return original(c);
    };
  });
  await page.route("**/api/private/session", (r) =>
    r.fulfill({ json: { authenticated: true, ready: true } }),
  );
  await page.route("**/api/ai/status**", (r) =>
    r.fulfill({
      json: {
        configured: true,
        mode: "draft-only",
        provider: "fixture.example",
        context: [],
        proposals: [],
      },
    }),
  );
  await page.route("**/api/ai/transcribe", (r) => {
    transcriptions++;
    expect(r.request().headers()["x-madar-consent"]).toBe("1");
    return r.fulfill({ json: { transcript: "نص صوتي عربي أولي" } });
  });
  await page.route("**/api/ai/propose", (r) => {
    submitted = r.request().postDataJSON().message;
    return r.fulfill({
      json: {
        proposals: [],
        plan: [],
        message: "لا مقترحات",
        mode: "draft-only",
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await expect(
    page.getByRole("button", { name: "تسجيل صوت عربي" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => (window as unknown as { __micCalls: number }).__micCalls,
    ),
  ).toBe(0);
  await page.getByLabel(/أوافق على إرسال النص/).check();
  await page.getByRole("button", { name: "تسجيل صوت عربي" }).click();
  await expect(page.getByRole("status")).toContainText("جارٍ التسجيل");
  await page.getByRole("button", { name: "إيقاف وتفريغ" }).click();
  await expect(page.getByLabel("راجع النص الصوتي قبل الإرسال")).toHaveValue(
    "نص صوتي عربي أولي",
  );
  expect(transcriptions).toBe(1);
  expect(submitted).toBe("");
  await page
    .getByLabel("راجع النص الصوتي قبل الإرسال")
    .fill("نص محرر قبل الإرسال");
  await page
    .getByRole("button", { name: "استخدم النص المحرر في الرسالة" })
    .click();
  expect(submitted).toBe("");
  await page.getByRole("button", { name: "إرسال الرسالة" }).click();
  await expect(page.locator(".messages")).toContainText("لا مقترحات");
  expect(submitted).toBe("نص محرر قبل الإرسال");
  await page.getByRole("button", { name: "تسجيل صوت عربي" }).click();
  await expect(page.getByRole("status")).toContainText("جارٍ التسجيل");
  await page.getByRole("button", { name: "إلغاء التسجيل" }).click();
  await expect(page.locator(".voice-state")).toHaveCount(0);
  expect(transcriptions).toBe(1);
  recordings = await page.evaluate(
    () => (window as unknown as { __micCalls: number }).__micCalls,
  );
  expect(recordings).toBe(2);
  await page.getByRole("button", { name: "تسجيل صوت عربي" }).click();
  await expect(page.getByRole("status")).toContainText("جارٍ التسجيل");
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: "اليوم", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await expect(page.locator(".voice-state")).toHaveCount(0);
  expect(transcriptions).toBe(1);
});
test("denied microphone and provider errors show safe recoverable feedback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.route("**/api/private/session", (r) =>
    r.fulfill({ json: { authenticated: true, ready: true } }),
  );
  await page.route("**/api/ai/status**", (r) =>
    r.fulfill({
      json: {
        configured: true,
        mode: "draft-only",
        provider: "fixture.example",
        context: [],
        proposals: [],
      },
    }),
  );
  await page.route("**/api/ai/propose", (r) =>
    r.fulfill({ status: 502, json: { error: "AI_PROVIDER_INVALID" } }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await page.getByLabel(/أوافق على إرسال النص/).check();
  await page.getByRole("button", { name: "تسجيل صوت عربي" }).click();
  await expect(page.locator(".conversation").getByRole("alert")).toContainText(
    "تحقق من إذن الميكروفون",
  );
  await page.getByRole("textbox", { name: "رسالتك للمساعد" }).fill("اختبار");
  await page.getByRole("button", { name: "إرسال الرسالة" }).click();
  await expect(page.locator(".conversation")).toContainText("لم يُنفّذ شيء");
  await expect(
    page.getByRole("button", { name: "إرسال الرسالة" }),
  ).toBeEnabled();
});
test("expired authentication clears private drafts and context instead of retaining results", async ({
  page,
}) => {
  await page.route("**/api/private/session", (r) =>
    r.fulfill({ json: { authenticated: true, ready: true } }),
  );
  await page.route("**/api/ai/status**", (r) =>
    r.fulfill({
      json: {
        configured: true,
        mode: "draft-only",
        provider: "fixture.example",
        context: [item],
        proposals: [proposal],
      },
    }),
  );
  await page.route("**/api/ai/propose", (r) =>
    r.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } }),
  );
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "التنقل الرئيسي", exact: true })
    .getByRole("button", { name: /المساعد/ })
    .click();
  await expect(page.locator(".ai-proposal")).toBeVisible();
  await page.getByLabel(/أوافق على إرسال النص/).check();
  await page
    .getByRole("textbox", { name: "رسالتك للمساعد" })
    .fill("اختبار جلسة");
  await page.getByRole("button", { name: "إرسال الرسالة" }).click();
  await expect(page.locator(".ai-proposal")).toHaveCount(0);
  await expect(page.locator(".ai-context")).toHaveCount(0);
  await expect(page.locator(".conversation")).toContainText("انتهت الجلسة");
  await expect(
    page.getByRole("textbox", { name: "رسالتك للمساعد" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "تسجيل صوت عربي" }),
  ).toBeDisabled();
});
