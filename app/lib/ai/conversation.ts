import "server-only";
import { randomUUID } from "node:crypto";
import { requirePrivateSession, response, errorResponse } from "../private/api";
import { assertOrigin, readJson } from "../private/config";
import { PrivateError } from "../private/errors";
import { requireAiArea, scopedContext } from "./scoped-store";
import type { AiContext } from "./api";
import type { ConversationMessage } from "./provider";
type History = {
  version: 1;
  revision: number;
  messages: ConversationMessage[];
  lastRequestId?: string;
};
function valid(value: unknown): value is History {
  if (!value || typeof value !== "object") return false;
  const h = value as History;
  return (
    h.version === 1 &&
    Number.isSafeInteger(h.revision) &&
    h.revision >= 0 &&
    Array.isArray(h.messages) &&
    h.messages.length <= 200 &&
    h.messages.every(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.text === "string" &&
        m.text.length <= 8000,
    )
  );
}
export async function conversationApi(request: Request, context: AiContext) {
  let lease: string | null = null;
  try {
    await requirePrivateSession(request, context);
    const body =
      request.method === "POST"
        ? (assertOrigin(request, context.config), await readJson(request))
        : null;
    if (!["GET", "POST"].includes(request.method))
      throw new PrivateError("METHOD_NOT_ALLOWED", 405);
    const area = requireAiArea(
      body?.spaceId ?? new URL(request.url).searchParams.get("spaceId"),
    );
    const slot = `ai-conversation:${area}`;
    if (body) {
      if (
        Object.keys(body).some(
          (k) =>
            ![
              "spaceId",
              "consent",
              "message",
              "revision",
              "requestId",
            ].includes(k),
        ) ||
        body.consent !== true ||
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 4000 ||
        typeof body.requestId !== "string" ||
        !/^[a-f\d-]{36}$/i.test(body.requestId) ||
        !Number.isSafeInteger(body.revision)
      )
        throw new PrivateError("AI_INVALID_DATA", 400);
      if (!context.ai.enabled || !context.provider)
        throw new PrivateError("AI_SETUP_REQUIRED", 503);
      lease = randomUUID();
      if (!(await context.store.lease("notion-workflow", lease))) {
        lease = null;
        throw new PrivateError("WORKFLOW_BUSY", 409, 5);
      }
    }
    const stored = await context.store.get<unknown>(slot);
    if (stored !== null && !valid(stored))
      throw new PrivateError("AI_HISTORY_INVALID", 409);
    const history: History =
      stored === null
        ? { version: 1, revision: 0, messages: [] }
        : (stored as History);
    if (!body) return response(history);
    if (history.lastRequestId === body.requestId) return response(history);
    if (history.revision !== body.revision)
      throw new PrivateError("AI_HISTORY_CONFLICT", 409);
    if (history.messages.length >= 200)
      throw new PrivateError("AI_HISTORY_LIMIT", 409);
    if (!(await context.store.consume("ai-conversation", 20, 600)))
      throw new PrivateError("AI_RATE_LIMITED", 429, 600);
    await context.store.audit("ai_request", "ok");
    const provider = context.provider();
    if (!provider.converse) throw new PrivateError("AI_SETUP_REQUIRED", 503);
    const messages: ConversationMessage[] = [
      ...history.messages,
      { role: "user", text: (body.message as string).trim() },
    ];
    const text = await provider.converse(
      messages.slice(-40),
      await scopedContext(context.store, area),
      area,
    );
    if (typeof text !== "string" || !text.trim() || text.length > 8000)
      throw new PrivateError("AI_PROVIDER_INVALID", 502);
    const next: History = {
      version: 1,
      revision: history.revision + 1,
      messages: [...messages, { role: "assistant", text }],
      lastRequestId: body.requestId as string,
    };
    await context.store.putAudited(slot, next, "ai_request", 2, lease!);
    return response(next);
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (lease)
      try {
        await context.store.release("notion-workflow", lease);
      } catch {
        /* bounded lease expires; never log content */
      }
  }
}
