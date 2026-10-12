import "server-only";
import { randomUUID } from "node:crypto";
import { assertOrigin, readJson } from "../private/config";
import {
  requirePrivateSession,
  response,
  errorResponse,
  type PrivateContext,
} from "../private/api";
import { PrivateError } from "../private/errors";
import {
  aiConfig,
  productionProvider,
  type AiConfig,
  type AiProvider,
} from "./provider";
import { allowedArea, type AiProposal } from "./model";
import {
  aiSlot,
  requireAiArea,
  scopedContext,
  scopedProposals,
} from "./scoped-store";
import {
  authorizedItems,
  fields,
  planningReferences,
  text,
  date,
} from "./validation";
export type AiContext = PrivateContext & {
  ai: AiConfig;
  provider: () => AiProvider;
};
export function withAi(context: PrivateContext): AiContext {
  const ai = aiConfig();
  return { ...context, ai, provider: () => productionProvider(ai) };
}
async function audioFile(request: Request): Promise<File> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new PrivateError("AI_AUDIO_INVALID", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new PrivateError("AI_AUDIO_INVALID", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4 * 1024 * 1024 + 4096) {
      await reader.cancel();
      throw new PrivateError("AI_AUDIO_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Request("https://madar.invalid", {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type")! },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new PrivateError("AI_AUDIO_INVALID", 400);
  }
  const file = form.get("audio");
  if (
    !(file instanceof File) ||
    file.size < 16 ||
    file.size > 4 * 1024 * 1024 ||
    !["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"].includes(file.type)
  )
    throw new PrivateError("AI_AUDIO_INVALID", 400);
  const bytes = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const valid =
    file.type === "audio/webm"
      ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : file.type === "audio/ogg"
        ? bytes.toString("ascii", 0, 4) === "OggS"
        : file.type === "audio/mp4"
          ? bytes.toString("ascii", 4, 8) === "ftyp"
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WAVE";
  if (!valid) throw new PrivateError("AI_AUDIO_INVALID", 400);
  const ext = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/wav": "wav",
  }[file.type];
  return new File([await file.arrayBuffer()], `capture.${ext}`, {
    type: file.type,
  });
}
export async function aiApi(
  request: Request,
  action: string,
  context: AiContext,
): Promise<Response> {
  let event:
    | "ai_request"
    | "ai_transcribe"
    | "ai_decision"
    | "ai_context"
    | null = null;
  let lock: string | null = null;
  try {
    await requirePrivateSession(request, context);
    if (request.method === "GET" && action === "status") {
      const area = requireAiArea(
        new URL(request.url).searchParams.get("spaceId") ?? "life",
      );
      return response({
        spaceId: area,
        configured: context.ai.enabled,
        mode: "draft-only",
        provider: context.ai.enabled ? new URL(context.ai.base).hostname : null,
        model: context.ai.model,
        transcriptionModel: context.ai.transcriptionModel,
        context: await scopedContext(context.store, area),
        proposals: await scopedProposals(context.store, area),
      });
    }
    if (
      request.method !== "POST" ||
      !["propose", "transcribe", "decision", "context"].includes(action)
    )
      throw new PrivateError("METHOD_NOT_ALLOWED", 405);
    assertOrigin(request, context.config);
    if (!(await context.store.consume("ai-owner", 20, 600)))
      throw new PrivateError("AI_RATE_LIMITED", 429, 600);
    if (action === "transcribe") {
      event = "ai_transcribe";
      if (
        request.headers.get("x-madar-consent") !== "1" ||
        !allowedArea(request.headers.get("x-madar-area"))
      )
        throw new PrivateError("AI_CONSENT_REQUIRED", 400);
      if (!context.ai.enabled) throw new PrivateError("AI_SETUP_REQUIRED", 503);
      const audio = await audioFile(request);
      await context.store.audit(event, "ok"); // Fail closed before external billing/processing.
      const transcript = await context.provider().transcribe(audio);
      return response({
        transcript: text(transcript, 4000, true),
        mode: "draft-only",
      });
    }
    const body = await readJson(request);
    const area = requireAiArea(body.spaceId);
    const source = await scopedContext(context.store, area);
    if (action === "propose") {
      event = "ai_request";
      if (body.consent !== true || !allowedArea(body.spaceId))
        throw new PrivateError("AI_CONSENT_REQUIRED", 400);
      const message = text(body.message, 4000);
      const today = date(body.today);
      if (!today) throw new PrivateError("AI_INVALID_DATA", 400);
      const planning = body.planning === true;
      if (!context.ai.enabled) throw new PrivateError("AI_SETUP_REQUIRED", 503);
      if (planning && !source.length)
        throw new PrivateError("AI_CONTEXT_REQUIRED", 409);
      await context.store.audit(event, "ok");
      const result = await context
        .provider()
        .propose(message, source, today, planning, area);
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new PrivateError("AI_PROVIDER_INVALID", 502);
      const r = result as Record<string, unknown>;
      if (
        Object.keys(r).some((k) => !["proposals", "planningIds"].includes(k)) ||
        !Array.isArray(r.proposals) ||
        r.proposals.length > 5 ||
        (planning && r.proposals.length)
      )
        throw new PrivateError("AI_PROVIDER_INVALID", 502);
      let proposals: AiProposal[];
      let references: string[];
      try {
        proposals = r.proposals.map((p) => ({
          ...fields(p, source),
          id: randomUUID(),
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        }));
        references = planningReferences(r.planningIds, source);
        if (proposals.some((p) => p.spaceId !== area)) throw Error("boundary");
      } catch {
        throw new PrivateError("AI_PROVIDER_INVALID", 502);
      }
      if (!planning && references.length)
        throw new PrivateError("AI_PROVIDER_INVALID", 502);
      // Do not let a provider expand planning into invented commitments: output is server-rendered authorized records only.
      lock = randomUUID();
      if (!(await context.store.lease("notion-workflow", lock)))
        throw new PrivateError("WORKFLOW_BUSY", 409, 5);
      const previous = await scopedProposals(context.store, area);
      if (previous.length + proposals.length > 200)
        throw new PrivateError("AI_DRAFT_LIMIT", 409);
      if (proposals.length)
        await context.store.putAudited(
          aiSlot("proposals", area),
          [...previous, ...proposals],
          event,
          proposals.length,
          lock,
        );
      return response({
        proposals,
        plan: references.map((id) => source.find((c) => c.id === id)!),
        message: planning
          ? "ترتيب مقترح للسجلات المؤكدة أدناه؛ لم يتغيّر أي موعد."
          : proposals.length
            ? "راجع المسودات قبل اعتمادها. لم يُنفّذ أي إجراء خارجي."
            : "لم يُنشأ مقترح صالح؛ أضف نوع السجل والوجهة والحقول اللازمة.",
        mode: "draft-only",
      });
    }
    lock = randomUUID();
    if (!(await context.store.lease("notion-workflow", lock)))
      throw new PrivateError("WORKFLOW_BUSY", 409, 5);
    if (action === "context") {
      event = "ai_context";
      if (body.consent !== true || body.confirmedActual !== true)
        throw new PrivateError("AI_CONSENT_REQUIRED", 400);
      const items = authorizedItems(body.items);
      if (items.some((item) => item.spaceId !== area))
        throw new PrivateError("AI_BOUNDARY_DENIED", 403);
      await context.store.putAudited(
        aiSlot("context", area),
        items,
        event,
        items.length,
        lock,
      );
      return response({ context: items });
    }
    event = "ai_decision";
    const proposals = await scopedProposals(context.store, area);
    const proposal = proposals.find((p) => p.id === body.id);
    if (!proposal) throw new PrivateError("AI_PROPOSAL_MISSING", 404);
    if (
      !["approved", "rejected"].includes(String(body.decision)) ||
      body.confirmed !== true
    )
      throw new PrivateError("AI_APPROVAL_REQUIRED", 400);
    if (proposal.status !== "pending")
      throw new PrivateError("AI_ALREADY_DECIDED", 409);
    const edited =
      body.decision === "approved" ? fields(body.fields, source) : proposal;
    if (edited.spaceId !== area)
      throw new PrivateError("AI_BOUNDARY_DENIED", 403);
    const updated = {
      ...proposal,
      ...edited,
      status: body.decision as "approved" | "rejected",
    };
    await context.store.putAudited(
      aiSlot("proposals", area),
      proposals.map((p) => (p.id === proposal.id ? updated : p)),
      event,
      1,
      lock,
    );
    return response({ proposal: updated, mode: "draft-only" });
  } catch (error) {
    if (event)
      try {
        await context.store.audit(event, "error");
      } catch {
        /* never log prompts, transcript, titles, keys or upstream exceptions */
      }
    return errorResponse(error);
  } finally {
    if (lock)
      try {
        await context.store.release("notion-workflow", lock);
      } catch {
        /* expires */
      }
  }
}
