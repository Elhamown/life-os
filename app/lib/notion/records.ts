import "server-only";
import { Client } from "@notionhq/client";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { assertOrigin, readJson } from "../private/config";
import {
  requirePrivateSession,
  response,
  errorResponse,
  type PrivateContext,
} from "../private/api";
import { PrivateError } from "../private/errors";
import { isNotionId, NOTION_API_VERSION } from "./gateway";
import type { DiscoveryJob, Mapping } from "./types";
import type { SpaceId } from "../model";
export type ImportedRecord = { id: string; title: string; editedAt: string };
export type ReadScope = {
  sourceId: string;
  area: SpaceId;
  titlePropertyId: string;
  automatic: boolean;
  revision: number;
  lastSuccess: string | null;
  since: string | null;
  cursor: string | null;
  seen: string[];
  cycleStarted: string | null;
  retryAt: string | null;
  failures: number;
  error: string | null;
  records: ImportedRecord[];
};
export type RecordReader = (
  scope: ReadScope,
) => Promise<{ rows: ImportedRecord[]; cursor: string | null }>;
export function recordReader(
  token: string,
  upstream: typeof fetch = fetch,
): RecordReader {
  return async (scope) => {
    const body = {
      page_size: 50,
      ...(scope.cursor ? { start_cursor: scope.cursor } : {}),
      ...(scope.since
        ? {
            filter: {
              timestamp: "last_edited_time",
              last_edited_time: { on_or_after: scope.since },
            },
          }
        : {}),
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    };
    const sdk = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
      retry: false,
      logger: () => undefined,
      fetch: async (input, init) => {
        const url = new URL(input);
        if (
          url.origin !== "https://api.notion.com" ||
          url.pathname !== `/v1/data_sources/${scope.sourceId}/query` ||
          url.search ||
          url.hash ||
          url.username ||
          url.password ||
          init?.method?.toUpperCase() !== "POST" ||
          new Headers(init.headers).get("notion-version") !==
            NOTION_API_VERSION ||
          typeof init.body !== "string" ||
          !isDeepStrictEqual(JSON.parse(init.body), body)
        )
          throw new PrivateError("NOTION_READ_SCOPE_DENIED", 403);
        const result = await upstream(input, {
          ...init,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(12000),
        });
        if (!result.ok) {
          const raw = result.headers.get("retry-after");
          await result.body?.cancel();
          throw new PrivateError(
            result.status === 429
              ? "NOTION_RATE_LIMITED"
              : "NOTION_READ_FAILED",
            result.status === 429 ? 429 : 503,
            raw && /^\d+$/.test(raw) ? Math.max(1, Number(raw)) : 30,
          );
        }
        const reader = result.body?.getReader();
        if (!reader) throw new PrivateError("NOTION_READ_FAILED", 503);
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 1024 * 1024) {
            await reader.cancel();
            throw new PrivateError("NOTION_READ_TOO_LARGE", 413);
          }
          chunks.push(value);
        }
        return new Response(Buffer.concat(chunks), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const result = await sdk.dataSources.query({
      data_source_id: scope.sourceId,
      ...body,
    } as Parameters<typeof sdk.dataSources.query>[0]);
    const rows: ImportedRecord[] = [];
    for (const page of result.results) {
      if (
        !("properties" in page) ||
        !("last_edited_time" in page) ||
        !("parent" in page) ||
        page.parent.type !== "data_source_id" ||
        page.parent.data_source_id.replaceAll("-", "") !==
          scope.sourceId.replaceAll("-", "")
      )
        throw new PrivateError("NOTION_READ_SCOPE_DENIED", 409);
      const property = Object.values(page.properties).find(
        (p) => p.id === scope.titlePropertyId,
      );
      if (!property || property.type !== "title")
        throw new PrivateError("NOTION_MAPPING_CHANGED", 409);
      const title = property.title
        .map((t: { plain_text: string }) => t.plain_text)
        .join("");
      if (title.length > 1000)
        throw new PrivateError("NOTION_READ_TOO_LARGE", 413);
      rows.push({ id: page.id, title, editedAt: page.last_edited_time });
    }
    if (result.has_more && !result.next_cursor)
      throw new PrivateError("NOTION_READ_INCOMPLETE", 409);
    return { rows, cursor: result.has_more ? result.next_cursor : null };
  };
}
export async function recordsApi(
  request: Request,
  context: PrivateContext,
  read: RecordReader = recordReader(context.config.notionToken ?? ""),
) {
  let lease: string | null = null;
  try {
    await requirePrivateSession(request, context);
    const scopes =
      (await context.store.get<ReadScope[]>("notion-read-scopes")) ?? [];
    if (request.method === "GET") {
      const report = await context.store.get<DiscoveryJob>("discovery"),
        mappings = (await context.store.get<Mapping[]>("mappings")) ?? [];
      return response({
        configured:
          !!context.config.notionToken && context.config.readOnlyAcknowledged,
        scopes,
        sources: mappings
          .filter((m) => m.reportId === report?.id)
          .map((m) => ({
            sourceId: m.sourceId,
            area: m.area,
            properties:
              report?.items
                .find((i) => i.id === m.sourceId && i.verified)
                ?.schema.filter((p) => p.type === "title") ?? [],
          })),
        mode: "read-only",
      });
    }
    if (request.method !== "POST")
      throw new PrivateError("METHOD_NOT_ALLOWED", 405);
    assertOrigin(request, context.config);
    const body = await readJson(request);
    if (
      !["configure", "step"].includes(String(body.action)) ||
      typeof body.sourceId !== "string" ||
      !isNotionId(body.sourceId)
    )
      throw new PrivateError("INVALID_REQUEST", 400);
    lease = randomUUID();
    if (!(await context.store.lease("notion-workflow", lease))) {
      lease = null;
      throw new PrivateError("WORKFLOW_BUSY", 409, 5);
    }
    // Reload under the lock: a stale request must not overwrite another source's progress.
    const current =
      (await context.store.get<ReadScope[]>("notion-read-scopes")) ?? [];
    const existing = current.find((s) => s.sourceId === body.sourceId);
    if (body.action === "configure") {
      if (
        Object.keys(body).some(
          (k) =>
            ![
              "action",
              "sourceId",
              "titlePropertyId",
              "approved",
              "automatic",
            ].includes(k),
        ) ||
        body.approved !== true ||
        typeof body.automatic !== "boolean" ||
        typeof body.titlePropertyId !== "string"
      )
        throw new PrivateError("NOTION_MAPPING_REVIEW_REQUIRED", 400);
      const report = await context.store.get<DiscoveryJob>("discovery"),
        mapping = (await context.store.get<Mapping[]>("mappings"))?.find(
          (m) => m.sourceId === body.sourceId && m.reportId === report?.id,
        );
      if (
        !mapping ||
        !report?.items.some(
          (i) =>
            i.id === body.sourceId &&
            i.verified &&
            i.kind === "data_source" &&
            i.schema.some(
              (p) => p.id === body.titlePropertyId && p.type === "title",
            ),
        )
      )
        throw new PrivateError("NOTION_MAPPING_REVIEW_REQUIRED", 409);
      if (existing && existing.titlePropertyId !== body.titlePropertyId)
        throw new PrivateError("NOTION_MAPPING_CHANGED", 409);
      const scope: ReadScope = existing
        ? {
            ...existing,
            automatic: body.automatic,
            revision: existing.revision + 1,
          }
        : {
            sourceId: body.sourceId,
            area: mapping.area,
            titlePropertyId: body.titlePropertyId,
            automatic: body.automatic,
            revision: 0,
            lastSuccess: null,
            since: null,
            cursor: null,
            seen: [],
            cycleStarted: null,
            retryAt: null,
            failures: 0,
            error: null,
            records: [],
          };
      await context.store.putAudited(
        "notion-read-scopes",
        [...current.filter((s) => s.sourceId !== scope.sourceId), scope],
        "sync_scope",
        1,
        lease,
      );
      return response({ scope });
    }
    if (
      Object.keys(body).some(
        (k) => !["action", "sourceId", "revision"].includes(k),
      ) ||
      !existing ||
      existing.revision !== body.revision
    )
      throw new PrivateError("NOTION_SYNC_CONFLICT", 409);
    const report = await context.store.get<DiscoveryJob>("discovery"),
      mapping = (await context.store.get<Mapping[]>("mappings"))?.find(
        (m) =>
          m.sourceId === existing.sourceId &&
          m.area === existing.area &&
          m.reportId === report?.id,
      );
    if (
      !mapping ||
      !report?.items.some(
        (i) =>
          i.id === existing.sourceId &&
          i.verified &&
          i.schema.some(
            (p) => p.id === existing.titlePropertyId && p.type === "title",
          ),
      )
    )
      throw new PrivateError("NOTION_MAPPING_CHANGED", 409);
    if (!context.config.notionToken || !context.config.readOnlyAcknowledged)
      throw new PrivateError("NOTION_SETUP_REQUIRED", 503);
    if (existing.retryAt && Date.parse(existing.retryAt) > Date.now())
      throw new PrivateError(
        "NOTION_RETRY_PENDING",
        429,
        Math.ceil((Date.parse(existing.retryAt) - Date.now()) / 1000),
      );
    if (!(await context.store.consume("notion-read-step", 30, 60)))
      throw new PrivateError("NOTION_RATE_LIMITED", 429, 60);
    const next = structuredClone(existing);
    next.cycleStarted ??= new Date().toISOString();
    await context.store.audit("sync_attempt", "ok");
    try {
      const result = await read(next);
      const rows = new Map(next.records.map((r) => [r.id, r]));
      for (const row of result.rows) {
        const old = rows.get(row.id);
        if (!old || row.editedAt >= old.editedAt) rows.set(row.id, row);
      }
      if (rows.size > 2000) throw new PrivateError("NOTION_READ_LIMIT", 409);
      if (
        result.cursor &&
        (next.seen.includes(result.cursor) ||
          result.cursor.length > 500 ||
          next.seen.length >= 40)
      )
        throw new PrivateError("NOTION_CURSOR_INVALID", 409);
      next.records = [...rows.values()];
      next.cursor = result.cursor;
      next.error = null;
      next.failures = 0;
      next.retryAt = null;
      if (result.cursor) next.seen.push(result.cursor);
      else {
        next.since = next.cycleStarted;
        next.lastSuccess = new Date().toISOString();
        next.cycleStarted = null;
        next.seen = [];
      }
    } catch (error) {
      next.failures++;
      next.error =
        error instanceof PrivateError ? error.code : "NOTION_READ_FAILED";
      next.retryAt = new Date(
        Date.now() +
          Math.max(
            error instanceof PrivateError ? (error.retryAfter ?? 0) : 0,
            Math.min(3600, 30 * 2 ** Math.min(next.failures, 7)),
          ) *
            1000,
      ).toISOString();
    }
    next.revision++;
    await context.store.putAudited(
      "notion-read-scopes",
      current.map((s) => (s.sourceId === next.sourceId ? next : s)),
      "sync_result",
      next.records.length,
      lease,
    );
    return response({ scope: next });
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (lease)
      try {
        await context.store.release("notion-workflow", lease);
      } catch {
        /* expires */
      }
  }
}
