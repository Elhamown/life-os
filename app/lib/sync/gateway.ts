import "server-only";
import { Client } from "@notionhq/client";
import { NOTION_API_VERSION } from "../notion/gateway";
import { fail, normalized, same, uuid } from "./validation";
import type {
  Properties,
  RemotePage,
  SourceScope,
  SyncAction,
  SyncGateway,
} from "./types";
export class SyncRemoteError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
type SdkFetch = NonNullable<
  NonNullable<ConstructorParameters<typeof Client>[0]>["fetch"]
>;
export function syncTransport(
  scope: SourceScope,
  grant: {
    recordId: string;
    pageId: string | null;
    payload: Properties;
    operation: "create" | "update";
    approved: boolean;
  },
  upstream: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): SdkFetch {
  let last = 0;
  return async (input, init) => {
    const url = new URL(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        return fail("SYNC_TRANSPORT_DENIED", 403);
      }
    }
    if (
      url.origin !== "https://api.notion.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return fail("SYNC_TRANSPORT_DENIED", 403);
    const sourcePath = `/v1/data_sources/${uuid(scope.sourceId)}`;
    const pagePath = grant.pageId ? `/v1/pages/${uuid(grant.pageId)}` : null;
    const read =
      method === "GET" &&
      !body &&
      (url.pathname === sourcePath || url.pathname === pagePath);
    const query =
      method === "POST" &&
      url.pathname === `${sourcePath}/query` &&
      same(body, {
        page_size: 2,
        filter: {
          property: scope.columns.recordId,
          rich_text: { equals: grant.recordId },
        },
      });
    const create =
      grant.approved &&
      grant.operation === "create" &&
      method === "POST" &&
      url.pathname === "/v1/pages" &&
      same(body, {
        parent: {
          type: "data_source_id",
          data_source_id: uuid(scope.sourceId),
        },
        properties: grant.payload,
      });
    const update =
      grant.approved &&
      grant.operation === "update" &&
      method === "PATCH" &&
      url.pathname === pagePath &&
      same(body, { properties: grant.payload });
    if (!read && !query && !create && !update)
      return fail("SYNC_TRANSPORT_DENIED", 403);
    const headers = new Headers(init?.headers);
    if (headers.get("notion-version") !== NOTION_API_VERSION)
      return fail("NOTION_VERSION_MISMATCH", 500);
    await sleep(Math.max(0, 400 - (Date.now() - last)));
    last = Date.now();
    let res: Response;
    try {
      res = await upstream(input, {
        method,
        headers,
        body: init?.body ? String(init.body) : undefined,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new SyncRemoteError(
        "NOTION_NETWORK_UNAVAILABLE",
        !!(create || update),
      );
    }
    if (!res.ok) {
      await res.body?.cancel();
      const raw = res.headers.get("retry-after");
      const retry =
        raw && /^\d+(?:\.\d+)?$/.test(raw)
          ? Math.max(1, Math.ceil(Number(raw)))
          : 60;
      throw new SyncRemoteError(
        res.status === 429
          ? "NOTION_RATE_LIMITED"
          : res.status === 409
            ? "NOTION_CONFLICT"
            : res.status === 401 || res.status === 403
              ? "NOTION_PERMISSION_DENIED"
              : res.status === 404
                ? "NOTION_TARGET_MISSING"
                : "NOTION_SYNC_FAILED",
        !!(create || update) && res.status >= 500,
        res.status === 429 ? retry : 0,
      );
    }
    const reader = res.body?.getReader();
    if (!reader)
      throw new SyncRemoteError(
        "NOTION_RESPONSE_INVALID",
        !!(create || update),
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(value);
      }
    } catch {
      throw new SyncRemoteError(
        "NOTION_RESPONSE_INVALID",
        !!(create || update),
      );
    }
    return new Response(Buffer.concat(chunks), {
      status: res.status,
      headers: res.headers,
    });
  };
}
export function createSyncGateway(
  token: string,
  scope: SourceScope,
  action: Pick<SyncAction, "recordId" | "pageId" | "payload" | "operation">,
  approved = false,
  upstream?: typeof fetch,
  sleep?: (ms: number) => Promise<void>,
): SyncGateway {
  const sdk = new Client({
    auth: token,
    notionVersion: NOTION_API_VERSION,
    retry: false,
    timeoutMs: 10000,
    logger: () => undefined,
    fetch: syncTransport(scope, { ...action, approved }, upstream, sleep),
  });
  function page(value: unknown): RemotePage {
    const p = value as {
      object?: string;
      id?: string;
      parent?: { data_source_id?: string };
      last_edited_time?: string;
      in_trash?: boolean;
      archived?: boolean;
      properties?: Record<string, { id?: string }>;
    };
    if (
      p.object !== "page" ||
      !p.id ||
      !p.parent?.data_source_id ||
      uuid(p.parent.data_source_id) !== uuid(scope.sourceId) ||
      !p.last_edited_time ||
      !p.properties
    )
      return fail("SYNC_TARGET_OUT_OF_SCOPE", 403);
    const mapped: Properties = {};
    for (const value of Object.values(p.properties)) {
      if (value.id) mapped[value.id] = value;
    }
    // Verify every mapped property is present before returning any record.
    normalized(
      mapped,
      Object.values(scope.columns).filter((id): id is string => id !== null),
    );
    return {
      id: uuid(p.id),
      sourceId: uuid(scope.sourceId),
      editedAt: p.last_edited_time,
      trashed: !!(p.in_trash || p.archived),
      properties: Object.fromEntries(
        Object.values(scope.columns)
          .filter((id): id is string => id !== null)
          .map((id) => [id, mapped[id]]),
      ),
    };
  }
  return Object.freeze({
    async schema() {
      const s = await sdk.dataSources.retrieve({
        data_source_id: scope.sourceId,
      });
      if ("in_trash" in s && s.in_trash)
        return fail("SYNC_SOURCE_TRASHED", 409);
      if (uuid(s.id) !== uuid(scope.sourceId))
        return fail("SYNC_TARGET_OUT_OF_SCOPE", 403);
      if (!("properties" in s)) return fail("SYNC_REMOTE_INCOMPLETE", 502);
      return {
        id: uuid(s.id),
        properties: Object.entries(s.properties).map(([name, p]) => ({
          id: p.id,
          name: "name" in p && typeof p.name === "string" ? p.name : name,
          type: p.type,
        })),
      };
    },
    async query(recordId: string) {
      if (recordId !== action.recordId)
        return fail("SYNC_TRANSPORT_DENIED", 403);
      const r = await sdk.dataSources.query({
        data_source_id: scope.sourceId,
        page_size: 2,
        filter: {
          property: scope.columns.recordId,
          rich_text: { equals: recordId },
        },
      });
      if (r.request_status && r.request_status.type !== "complete")
        return fail("SYNC_QUERY_INCOMPLETE", 502);
      if (r.results.length > 2 || (!r.results.length && r.has_more))
        return fail("SYNC_REMOTE_INCOMPLETE", 502);
      return { pages: r.results.map(page), more: r.has_more };
    },
    async page(id: string) {
      if (!action.pageId || uuid(id) !== uuid(action.pageId))
        return fail("SYNC_TRANSPORT_DENIED", 403);
      return page(await sdk.pages.retrieve({ page_id: id }));
    },
    async create(payload: Properties) {
      if (
        !approved ||
        action.operation !== "create" ||
        !same(payload, action.payload)
      )
        return fail("SYNC_APPROVAL_REQUIRED", 403);
      return page(
        await sdk.pages.create({
          parent: { type: "data_source_id", data_source_id: scope.sourceId },
          properties: payload as Parameters<
            typeof sdk.pages.create
          >[0]["properties"],
        }),
      );
    },
    async update(id: string, payload: Properties) {
      if (
        !approved ||
        action.operation !== "update" ||
        !action.pageId ||
        uuid(id) !== uuid(action.pageId) ||
        !same(payload, action.payload)
      )
        return fail("SYNC_APPROVAL_REQUIRED", 403);
      return page(
        await sdk.pages.update({
          page_id: id,
          properties: payload as Parameters<
            typeof sdk.pages.update
          >[0]["properties"],
        }),
      );
    },
  });
}
