import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { syncFixture } from "./sync-fixtures";
import { conversationApi } from "../app/lib/ai/conversation";
import type { AiContext } from "../app/lib/ai/api";
import type { ConversationMessage } from "../app/lib/ai/provider";
test("multi-turn conversations persist per allowed area; idempotent replies avoid repeated provider calls", async () => {
  const f = await syncFixture(true);
  let calls = 0;
  const contexts: ConversationMessage[][] = [];
  const context: AiContext = {
    ...f.context,
    ai: {
      base: "https://provider.invalid",
      key: "fixture",
      model: "fixture",
      transcriptionModel: "fixture",
      enabled: true,
    },
    provider: () => ({
      async converse(messages) {
        calls++;
        contexts.push(messages);
        return "رد اختبار من مزوّد وهمي";
      },
      async propose() {
        return {};
      },
      async transcribe() {
        return "";
      },
    }),
  };
  const req = (
    body?: unknown,
    area = "life",
    cookie = f.cookie,
    origin = f.context.config.origin,
  ) =>
    new Request(f.context.config.origin + "/api/conversation?spaceId=" + area, {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal(
      (await conversationApi(req(undefined, "life", ""), context)).status,
      401,
    );
    const first = {
      spaceId: "life",
      consent: true,
      revision: 0,
      requestId: randomUUID(),
      message: "عندي بكرا شغل كتير",
    };
    assert.equal(
      (await conversationApi(req({ ...first, consent: false }), context))
        .status,
      400,
    );
    assert.equal(
      (
        await conversationApi(
          req(first, "life", f.cookie, "https://evil.example"),
          context,
        )
      ).status,
      403,
    );
    assert.equal(
      (await conversationApi(req({ ...first, spaceId: "health" }), context))
        .status,
      400,
    );
    assert.equal(calls, 0);
    const response = await conversationApi(req(first), context);
    assert.equal(response.status, 200);
    const history = await response.json();
    assert.equal(history.messages.length, 2);
    assert.equal((await conversationApi(req(first), context)).status, 200);
    assert.equal(calls, 1);
    assert.equal(
      (
        await conversationApi(
          req({ ...first, requestId: randomUUID() }),
          context,
        )
      ).status,
      409,
    );
    assert.equal(calls, 1);
    const next = await conversationApi(
      req({
        ...first,
        revision: 1,
        requestId: randomUUID(),
        message: "التصميم الأول مستعجل",
      }),
      context,
    );
    assert.equal(next.status, 200);
    assert.equal((await next.json()).messages.length, 4);
    assert.equal(contexts[1].length, 3);
    const fresh = await (await conversationApi(req(), context)).json();
    assert.equal(fresh.messages.length, 4);
    const isolated = await (
      await conversationApi(req(undefined, "studio"), context)
    ).json();
    assert.equal(isolated.messages.length, 0);
    assert.equal(f.requests.length, 0);
    const raw = await f.db!.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM madar_private_state WHERE name='ai-conversation:life'",
    );
    assert.ok(!raw.rows[0].ciphertext.includes(first.message));
  } finally {
    await f.db?.close();
  }
});
test("missing provider config and malformed provider replies cannot create fake conversation history", async () => {
  const f = await syncFixture();
  const context: AiContext = {
    ...f.context,
    ai: {
      base: "https://provider.invalid",
      key: "",
      model: "fixture",
      transcriptionModel: "fixture",
      enabled: false,
    },
    provider: () => ({
      async converse() {
        return "";
      },
      async propose() {
        return {};
      },
      async transcribe() {
        return "";
      },
    }),
  };
  const request = () =>
    new Request(f.context.config.origin + "/api/conversation", {
      method: "POST",
      headers: {
        Cookie: f.cookie,
        Origin: f.context.config.origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spaceId: "life",
        consent: true,
        revision: 0,
        requestId: randomUUID(),
        message: "رسالة اختبار",
      }),
    });
  assert.equal((await conversationApi(request(), context)).status, 503);
  context.ai.enabled = true;
  assert.equal((await conversationApi(request(), context)).status, 502);
  assert.equal(await f.store.get("ai-conversation:life"), null);
});
