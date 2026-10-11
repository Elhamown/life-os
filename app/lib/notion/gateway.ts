import "server-only";
import { Client } from "@notionhq/client";
import { PrivateError } from "../private/errors";
export const NOTION_API_VERSION = "2026-03-11";
const idPattern =
  "(?:[a-f\\d]{32}|[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12})";
const readPath = new RegExp(
  `^/v1/(?:data_sources|databases)/${idPattern}$`,
  "i",
);
export const isNotionId = (id: string) =>
  new RegExp(`^${idPattern}$`, "i").test(id);
type SdkFetch = NonNullable<
  NonNullable<ConstructorParameters<typeof Client>[0]>["fetch"]
>;
export function auditTransport(
  options: {
    upstream?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): SdkFetch {
  const upstream = options.upstream ?? fetch;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  let lastRequest = now();
  return async (input, init) => {
    const url = new URL(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (
      url.origin !== "https://api.notion.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        (method === "GET" && readPath.test(url.pathname) && !init?.body) ||
        (method === "POST" && url.pathname === "/v1/search")
      )
    )
      throw new PrivateError("NOTION_AUDIT_WRITE_BLOCKED", 403);
    if (method === "POST") {
      let body: Record<string, unknown>;
      try {
        if (typeof init?.body !== "string") throw Error();
        body = JSON.parse(init.body);
        if (!body || Array.isArray(body) || typeof body !== "object")
          throw Error();
      } catch {
        throw new PrivateError("NOTION_AUDIT_WRITE_BLOCKED", 403);
      }
      if (
        Object.keys(body).some(
          (k) => !["page_size", "start_cursor"].includes(k),
        ) ||
        body.page_size !== 100 ||
        (body.start_cursor !== undefined &&
          (typeof body.start_cursor !== "string" ||
            body.start_cursor.length > 500))
      )
        throw new PrivateError("NOTION_AUDIT_WRITE_BLOCKED", 403);
    }
    const headers = new Headers(init?.headers);
    if (headers.get("notion-version") !== NOTION_API_VERSION)
      throw new PrivateError("NOTION_VERSION_MISMATCH", 500);
    const started = now();
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(Math.max(0, 400 - (now() - lastRequest)));
      lastRequest = now();
      let response: Response;
      try {
        response = await upstream(input, {
          method,
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        throw new PrivateError("NOTION_NETWORK_UNAVAILABLE", 503);
      }
      if (
        response.status !== 429 &&
        ![500, 502, 503, 504, 529].includes(response.status)
      )
        return response;
      const raw = response.headers.get("retry-after");
      const retryMs =
        raw && /^\d+(?:\.\d+)?$/.test(raw)
          ? Math.ceil(Number(raw) * 1000)
          : raw && Number.isFinite(Date.parse(raw))
            ? Math.max(0, Date.parse(raw) - now())
            : 1000 * 2 ** attempt;
      // Never shorten Retry-After. Long waits are persisted and resumed in a later request.
      if (attempt === 2 || retryMs > 10000 || now() - started + retryMs > 20000)
        throw new PrivateError(
          response.status === 429
            ? "NOTION_RATE_LIMITED"
            : "NOTION_TEMPORARILY_UNAVAILABLE",
          response.status === 429 ? 429 : 503,
          Math.max(1, Math.ceil(retryMs / 1000)),
        );
      await sleep(retryMs);
    }
    throw new PrivateError("NOTION_TEMPORARILY_UNAVAILABLE", 503);
  };
}
export type ReadOnlyNotion = {
  search(cursor?: string): ReturnType<Client["search"]>;
  retrieveSource(id: string): ReturnType<Client["dataSources"]["retrieve"]>;
  retrieveDatabase(id: string): ReturnType<Client["databases"]["retrieve"]>;
};
export function createReadOnlyNotion(token: string): ReadOnlyNotion {
  const sdk = new Client({
    auth: token,
    notionVersion: NOTION_API_VERSION,
    fetch: auditTransport(),
    retry: false,
    timeoutMs: 30000,
    logger: () => undefined,
  });
  // Only these three metadata operations escape the server-side closure.
  return Object.freeze({
    search: (cursor?: string) =>
      sdk.search({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    retrieveSource: (id: string) =>
      sdk.dataSources.retrieve({ data_source_id: id }),
    retrieveDatabase: (id: string) =>
      sdk.databases.retrieve({ database_id: id }),
  });
}
