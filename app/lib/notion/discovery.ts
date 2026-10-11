import "server-only";
import {
  isFullDataSource,
  isFullDatabase,
  isFullPage,
  isHTTPResponseError,
  type DataSourceObjectResponse,
  type DatabaseObjectResponse,
  type PageObjectResponse,
} from "@notionhq/client";
import { randomUUID } from "node:crypto";
import { PrivateError } from "../private/errors";
import { isNotionId, type ReadOnlyNotion } from "./gateway";
import type { DiscoveryJob, InventoryItem, SchemaProperty } from "./types";
export const INVENTORY_LIMIT = 1000;
const text = (value: { plain_text: string }[]) =>
  value
    .map((v) => v.plain_text)
    .join("")
    .slice(0, 300);
function parentId(parent: object): string | null {
  return "database_id" in parent
    ? String(parent.database_id)
    : "data_source_id" in parent
      ? String(parent.data_source_id)
      : "page_id" in parent
        ? String(parent.page_id)
        : "block_id" in parent
          ? String(parent.block_id)
          : null;
}
function pageMetadata(page: PageObjectResponse): InventoryItem {
  const titleProperty = Object.values(page.properties).find(
    (p) => p.type === "title",
  );
  return {
    id: page.id,
    kind: "page",
    title:
      titleProperty?.type === "title"
        ? text(titleProperty.title)
        : "صفحة بلا عنوان",
    parentId: parentId(page.parent),
    createdAt: page.created_time,
    editedAt: page.last_edited_time,
    schema: [],
    verified: true,
  };
}
function sourceMetadata(source: DataSourceObjectResponse): InventoryItem {
  const schema: SchemaProperty[] = Object.values(source.properties).map(
    (p) => ({
      id: p.id,
      name: p.name.slice(0, 200),
      type: p.type,
      ...(p.type === "relation"
        ? {
            relation: {
              dataSourceId: p.relation.data_source_id || null,
              databaseId: p.relation.database_id || null,
              syncedPropertyId:
                "dual_property" in p.relation
                  ? p.relation.dual_property.synced_property_id
                  : null,
            },
          }
        : {}),
    }),
  );
  return {
    id: source.id,
    kind: "data_source",
    title: text(source.title),
    parentId: parentId(source.parent),
    createdAt: source.created_time,
    editedAt: source.last_edited_time,
    schema,
    verified: true,
  };
}
function databaseMetadata(database: DatabaseObjectResponse): InventoryItem {
  return {
    id: database.id,
    kind: "database",
    title: text(database.title),
    parentId: parentId(database.parent),
    createdAt: database.created_time,
    editedAt: database.last_edited_time,
    schema: [],
    verified: true,
  };
}
export function startDiscovery(now = new Date().toISOString()): DiscoveryJob {
  return {
    id: randomUUID(),
    revision: 0,
    startedAt: now,
    updatedAt: now,
    status: "running",
    searchDone: false,
    cursor: null,
    seenCursors: [],
    sources: [],
    databases: [],
    visitedSources: [],
    visitedDatabases: [],
    items: [],
    warnings: [],
    retryAt: null,
  };
}
export async function discoveryStep(
  original: DiscoveryJob,
  notion: ReadOnlyNotion,
  now: () => number = Date.now,
): Promise<DiscoveryJob> {
  const job = structuredClone(original);
  if (job.status !== "running") return job;
  if (job.retryAt && Date.parse(job.retryAt) > now())
    throw new PrivateError(
      "NOTION_RATE_LIMITED",
      429,
      Math.ceil((Date.parse(job.retryAt) - now()) / 1000),
    );
  job.retryAt = null;
  const started = now();
  function markLimit() {
    if (!job.warnings.some((w) => w.code === "LIMIT_REACHED"))
      job.warnings.push({ code: "LIMIT_REACHED" });
    job.searchDone = true;
  }
  function capacity() {
    return job.items.length + job.sources.length + job.databases.length;
  }
  function queueSource(id: string) {
    if (
      isNotionId(id) &&
      !job.visitedSources.includes(id) &&
      !job.sources.includes(id)
    ) {
      if (capacity() >= INVENTORY_LIMIT) markLimit();
      else job.sources.push(id);
    }
  }
  function queueDatabase(id: string) {
    if (
      isNotionId(id) &&
      !job.visitedDatabases.includes(id) &&
      !job.databases.includes(id)
    ) {
      if (capacity() >= INVENTORY_LIMIT) markLimit();
      else job.databases.push(id);
    }
  }
  function upsert(item: InventoryItem) {
    const index = job.items.findIndex(
      (i) => i.id === item.id && i.kind === item.kind,
    );
    if (index >= 0) job.items[index] = item;
    else job.items.push(item);
  }
  for (let call = 0; call < 4 && now() - started < 18000; call++) {
    if (job.items.length >= INVENTORY_LIMIT) {
      job.status = "partial";
      markLimit();
      break;
    }
    if (
      !job.searchDone &&
      (capacity() >= INVENTORY_LIMIT || job.seenCursors.length >= 100)
    )
      markLimit();
    let objectId: string | undefined;
    try {
      if (!job.searchDone) {
        const result = await notion.search(job.cursor || undefined);
        for (const item of result.results) {
          if (capacity() >= INVENTORY_LIMIT) {
            markLimit();
            break;
          }
          if ("in_trash" in item && item.in_trash) continue;
          if (item.object === "page") {
            if (isFullPage(item)) upsert(pageMetadata(item));
            else job.warnings.push({ code: "PARTIAL_OBJECT", id: item.id });
          } else if (item.object === "data_source") queueSource(item.id);
        }
        if (result.request_status?.type === "incomplete")
          job.warnings.push({ code: "SEARCH_INCOMPLETE" });
        if (result.has_more) {
          if (
            !result.next_cursor ||
            result.next_cursor.length > 500 ||
            job.seenCursors.includes(result.next_cursor)
          ) {
            job.searchDone = true;
            job.warnings.push({ code: "CURSOR_INVALID" });
          } else {
            job.cursor = result.next_cursor;
            job.seenCursors.push(result.next_cursor);
          }
        } else job.searchDone = true;
      } else if (job.sources.length) {
        objectId = job.sources[0];
        const source = await notion.retrieveSource(objectId);
        if (isFullDataSource(source) && !source.in_trash) {
          upsert(sourceMetadata(source));
          if (source.parent.type === "database_id")
            queueDatabase(source.parent.database_id);
          else if (source.parent.type === "data_source_id")
            queueSource(source.parent.data_source_id);
        } else job.warnings.push({ code: "PARTIAL_OBJECT", id: objectId });
        job.sources.shift();
        job.visitedSources.push(objectId);
      } else if (job.databases.length) {
        objectId = job.databases[0];
        const database = await notion.retrieveDatabase(objectId);
        if (isFullDatabase(database) && !database.in_trash) {
          upsert(databaseMetadata(database));
          for (const source of database.data_sources) queueSource(source.id);
        } else job.warnings.push({ code: "PARTIAL_OBJECT", id: objectId });
        job.databases.shift();
        job.visitedDatabases.push(objectId);
      } else {
        job.status = job.warnings.length ? "partial" : "complete";
        break;
      }
    } catch (error) {
      if (
        isHTTPResponseError(error) &&
        [403, 404].includes(error.status) &&
        objectId
      ) {
        job.warnings.push({ code: "INACCESSIBLE", id: objectId });
        if (job.sources[0] === objectId) {
          job.sources.shift();
          job.visitedSources.push(objectId);
        } else {
          job.databases.shift();
          job.visitedDatabases.push(objectId);
        }
      } else if (
        error instanceof PrivateError &&
        error.code === "NOTION_RATE_LIMITED"
      ) {
        job.retryAt = new Date(
          now() + (error.retryAfter ?? 1) * 1000,
        ).toISOString();
        break;
      } else {
        if (isHTTPResponseError(error))
          throw new PrivateError(
            error.status === 401
              ? "NOTION_TOKEN_INVALID"
              : error.status === 403
                ? "NOTION_ACCESS_DENIED"
                : "NOTION_REQUEST_FAILED",
            error.status === 401 || error.status === 403 ? 502 : 503,
          );
        throw error;
      }
    }
  }
  if (
    job.searchDone &&
    !job.sources.length &&
    !job.databases.length &&
    !job.retryAt &&
    job.status === "running"
  )
    job.status = job.warnings.length ? "partial" : "complete";
  job.revision++;
  job.updatedAt = new Date(now()).toISOString();
  return job;
}
