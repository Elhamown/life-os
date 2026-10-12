import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrivateConfig } from "./config";
import { assertOrigin, readJson } from "./config";
import {
  cookieName,
  digest,
  issueToken,
  passwordMatches,
  SESSION_SECONDS,
  verifyToken,
} from "./crypto";
import type { Store } from "./store";
import { PrivateError, safeError } from "./errors";
import type { ReadOnlyNotion } from "../notion/gateway";
import { discoveryStep, startDiscovery } from "../notion/discovery";
import { approveMappings, auditView } from "../notion/report";
import type { DiscoveryJob, Mapping } from "../notion/types";
export type PrivateContext = {
  config: PrivateConfig;
  store: Store;
  notion: () => ReadOnlyNotion;
};
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export function response(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, { status, headers: { ...headers, ...extra } });
}
export function errorResponse(error: unknown) {
  const safe = safeError(error);
  return response(
    { error: safe.code },
    safe.status,
    safe.retryAfter ? { "Retry-After": String(safe.retryAfter) } : {},
  );
}
function sessionCookie(
  config: PrivateConfig,
  value: string,
  age = SESSION_SECONDS,
) {
  return `${cookieName(config)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secureCookies ? "; Secure" : ""}`;
}
async function sessionId(
  request: Request,
  context: PrivateContext,
): Promise<string | null> {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName(context.config)}=`))
    ?.slice(cookieName(context.config).length + 1);
  if (!cookie) return null;
  const id = await verifyToken(context.config, cookie);
  return id && (await context.store.session(digest(id))) ? id : null;
}
export async function requirePrivateSession(
  request: Request,
  context: PrivateContext,
): Promise<string> {
  const id = await sessionId(request, context);
  if (!id) {
    await context.store.audit("access_denied", "denied");
    throw new PrivateError("AUTH_REQUIRED", 401);
  }
  return id;
}
export async function privateAuthApi(
  request: Request,
  action: string,
  context: PrivateContext,
): Promise<Response> {
  try {
    if (request.method === "GET" && action === "session")
      return response({
        authenticated: !!(await sessionId(request, context)),
        ready: true,
      });
    if (request.method !== "POST" || !["login", "logout"].includes(action))
      throw new PrivateError("METHOD_NOT_ALLOWED", 405);
    assertOrigin(request, context.config);
    if (action === "logout") {
      const id = await requirePrivateSession(request, context);
      await context.store.revokeSession(digest(id));
      await context.store.audit("logout", "ok");
      return response({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(context.config, "", 0),
      });
    }
    if (!(await context.store.consume("owner-login", 5, 600))) {
      await context.store.audit("login", "denied");
      throw new PrivateError("LOGIN_RATE_LIMITED", 429, 600);
    }
    const body = await readJson(request);
    if (Object.keys(body).some((key) => key !== "password"))
      throw new PrivateError("INVALID_REQUEST", 400);
    if (
      typeof body.password !== "string" ||
      !(await passwordMatches(body.password, context.config.passwordHash))
    ) {
      await context.store.audit("login", "denied");
      throw new PrivateError("LOGIN_FAILED", 401);
    }
    const id = randomBytes(32).toString("hex");
    const token = await issueToken(context.config, id);
    await context.store.createSession(
      digest(id),
      new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
    );
    await context.store.audit("login", "ok");
    return response({ authenticated: true }, 200, {
      "Set-Cookie": sessionCookie(context.config, token),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function notionApi(
  request: Request,
  action: string,
  context: PrivateContext,
): Promise<Response> {
  let lease: string | null = null;
  let event: "discovery_start" | "discovery_step" | "mappings_save" | null =
    null;
  try {
    await requirePrivateSession(request, context);
    if (request.method === "GET") {
      if (action === "report") {
        const job = await context.store.get<DiscoveryJob>("discovery");
        const mappings = (await context.store.get<Mapping[]>("mappings")) ?? [];
        await context.store.audit("discovery_read", "ok", job?.items.length);
        return response({ report: job ? auditView(job) : null, mappings });
      }
      if (action === "audit")
        return response({ entries: await context.store.logs() });
      if (action === "status")
        return response({
          configured:
            !!context.config.notionToken && context.config.readOnlyAcknowledged,
          apiVersion: "2026-03-11",
          mode: "read-only",
        });
      throw new PrivateError("NOT_FOUND", 404);
    }
    if (
      request.method !== "POST" ||
      !["start", "step", "mappings"].includes(action)
    )
      throw new PrivateError("METHOD_NOT_ALLOWED", 405);
    assertOrigin(request, context.config);
    const body = await readJson(request);
    const lockId = randomUUID();
    if (!(await context.store.lease("notion-workflow", lockId)))
      throw new PrivateError("WORKFLOW_BUSY", 409, 5);
    lease = lockId;
    if (action === "mappings") {
      event = "mappings_save";
      const job = await context.store.get<DiscoveryJob>("discovery");
      if (!job) throw new PrivateError("DISCOVERY_REQUIRED", 409);
      const previous = (await context.store.get<Mapping[]>("mappings")) ?? [];
      const mappings = approveMappings(
        job,
        previous,
        body.mappings,
        body.reportId,
        body.revision,
        body.approved,
      );
      await context.store.putAudited(
        "mappings",
        mappings,
        event,
        Array.isArray(body.mappings) ? body.mappings.length : 0,
        lockId,
      );
      return response({ mappings });
    }
    if (!context.config.notionToken || !context.config.readOnlyAcknowledged)
      throw new PrivateError("NOTION_SETUP_REQUIRED", 503);
    event = action === "start" ? "discovery_start" : "discovery_step";
    let job = await context.store.get<DiscoveryJob>("discovery");
    if (action === "start") {
      if (body.acknowledged !== true)
        throw new PrivateError("DISCOVERY_REVIEW_REQUIRED", 400);
      if (job?.status === "running")
        throw new PrivateError("DISCOVERY_IN_PROGRESS", 409);
      job = startDiscovery();
      await context.store.audit(event, "ok");
      if (!(await context.store.putUnderLease("discovery", job, lockId)))
        throw new PrivateError("WORKFLOW_BUSY", 409, 5);
    } else if (
      !job ||
      job.id !== body.reportId ||
      job.revision !== body.revision
    )
      throw new PrivateError("REPORT_CHANGED", 409);
    if (!job) throw new PrivateError("DISCOVERY_REQUIRED", 409);
    // Audit must persist before the first upstream Notion operation. Failure is closed.
    if (action === "step") await context.store.audit(event, "ok");
    const next = await discoveryStep(job, context.notion());
    if (!(await context.store.putUnderLease("discovery", next, lockId)))
      throw new PrivateError("WORKFLOW_BUSY", 409, 5);
    return response({ report: auditView(next) });
  } catch (error) {
    if (event) {
      try {
        await context.store.audit(event, "error");
      } catch {
        /* No raw exception data is logged. */
      }
    }
    return errorResponse(error);
  } finally {
    if (lease) {
      try {
        await context.store.release("notion-workflow", lease);
      } catch {
        /* Lease expires after 90 seconds if the store is unavailable. */
      }
    }
  }
}
