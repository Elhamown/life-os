import "server-only";
import { createHash } from "node:crypto";
import { isNotionId } from "../notion/gateway";
import { PrivateError } from "../private/errors";
import type {
  ColumnMap,
  Properties,
  RecordFields,
  RemotePage,
  SourceSchema,
  SourceScope,
  SyncConfig,
} from "./types";
export function fail(code: string, status = 400): never {
  throw new PrivateError(code, status);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !isNotionId(value))
    return fail("SYNC_INVALID_ID");
  return value
    .replace(/-/g, "")
    .toLowerCase()
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}
export function syncConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SyncConfig {
  const ids = (value: string | undefined) => [
    ...new Set(
      (value ?? "")
        .split(",")
        .filter(Boolean)
        .map((v) => uuid(v.trim())),
    ),
  ];
  const token = env.NOTION_SYNC_TOKEN || null;
  const testIds = ids(env.NOTION_SYNC_TEST_SOURCE_IDS),
    existingIds = ids(env.NOTION_SYNC_WRITE_SOURCE_IDS);
  if (testIds.some((id) => existingIds.includes(id)))
    return fail("SYNC_SETUP_REQUIRED", 503);
  return {
    token,
    enabled:
      !!token &&
      env.NOTION_SYNC_WRITE_ACK === "1" &&
      env.NOTION_SYNC_TEST_ACK === "1",
    testIds,
    existingIds,
    connectionHash: hash({ token, testIds, existingIds }),
  };
}
export function validateColumns(
  value: unknown,
  schema: SourceSchema,
): ColumnMap {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("SYNC_COLUMNS_INVALID");
  const v = value as Record<string, unknown>;
  const types = {
    title: "title",
    recordId: "rich_text",
    details: "rich_text",
    date: "date",
    kind: "rich_text",
    duration: "number",
  };
  if (Object.keys(v).some((k) => !(k in types)))
    return fail("SYNC_COLUMNS_INVALID");
  const seen = new Set<string>();
  for (const [key, type] of Object.entries(types)) {
    const id = v[key];
    if (id === null && !["title", "recordId"].includes(key)) continue;
    if (
      typeof id !== "string" ||
      seen.has(id) ||
      !schema.properties.some((p) => p.id === id && p.type === type)
    )
      return fail("SYNC_COLUMNS_INVALID");
    seen.add(id);
  }
  return v as ColumnMap;
}
export function recordFields(value: unknown): RecordFields {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("SYNC_FIELDS_INVALID");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        !["title", "details", "date", "kind", "durationMinutes"].includes(k),
    ) ||
    typeof v.title !== "string" ||
    !v.title.trim() ||
    v.title.length > 200 ||
    !["task", "event", "note", "study"].includes(String(v.kind)) ||
    typeof v.kind !== "string"
  )
    return fail("SYNC_FIELDS_INVALID");
  if (
    v.details !== null &&
    (typeof v.details !== "string" || v.details.length > 1000)
  )
    return fail("SYNC_FIELDS_INVALID");
  if (v.date !== null) {
    if (
      typeof v.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))?$/.test(
        v.date,
      ) ||
      !Number.isFinite(Date.parse(v.date))
    )
      return fail("SYNC_FIELDS_INVALID");
    const day = v.date.slice(0, 10);
    if (new Date(day).toISOString().slice(0, 10) !== day)
      return fail("SYNC_FIELDS_INVALID");
    if (
      v.date.includes("T") &&
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(
        v.date,
      )
    )
      return fail("SYNC_FIELDS_INVALID");
  }
  if (
    v.durationMinutes !== null &&
    (!Number.isInteger(v.durationMinutes) ||
      Number(v.durationMinutes) < 5 ||
      Number(v.durationMinutes) > 480)
  )
    return fail("SYNC_FIELDS_INVALID");
  return {
    title: v.title.trim(),
    details: v.details as string | null,
    date: v.date as string | null,
    kind: v.kind as RecordFields["kind"],
    durationMinutes: v.durationMinutes as number | null,
  };
}
export const schemaHash = (schema: SourceSchema) =>
  hash({
    id: uuid(schema.id),
    properties: [...schema.properties].sort((a, b) => a.id.localeCompare(b.id)),
  });
export function properties(
  fields: RecordFields,
  recordId: string,
  scope: SourceScope,
): Properties {
  const c = scope.columns;
  const rich = (content: string) => [{ type: "text", text: { content } }];
  const result: Properties = {
    [c.title]: { title: rich(fields.title) },
    [c.recordId]: { rich_text: rich(recordId) },
  };
  if (
    (fields.details !== null && !c.details) ||
    (fields.date !== null && !c.date) ||
    (fields.durationMinutes !== null && !c.duration)
  )
    return fail("SYNC_UNMAPPED_FIELDS");
  if (c.details && fields.details !== null)
    result[c.details] = { rich_text: rich(fields.details) };
  if (c.date && fields.date !== null)
    result[c.date] = { date: { start: fields.date } };
  if (c.kind) result[c.kind] = { rich_text: rich(fields.kind) };
  if (c.duration && fields.durationMinutes !== null)
    result[c.duration] = { number: fields.durationMinutes };
  return result;
}
export function normalized(properties: Properties, keys: string[]): Properties {
  const result: Properties = {};
  for (const key of keys) {
    const p = properties[key] as Record<string, unknown> | undefined;
    if (!p) return fail("SYNC_REMOTE_INCOMPLETE", 502);
    if ("title" in p || "rich_text" in p) {
      const type = "title" in p ? "title" : "rich_text";
      const values = p[type];
      if (!Array.isArray(values)) return fail("SYNC_REMOTE_INCOMPLETE", 502);
      result[key] = {
        [type]: values
          .map((x) => {
            if (!x || typeof x !== "object")
              return fail("SYNC_REMOTE_INCOMPLETE", 502);
            return String(x.plain_text ?? x.text?.content ?? "");
          })
          .join(""),
      };
    } else if ("date" in p) {
      const d = p.date as {
        start: string;
        end?: string | null;
        time_zone?: string | null;
      } | null;
      result[key] = {
        date: d
          ? {
              start: normalizeDate(d.start),
              end: d.end ? normalizeDate(d.end) : null,
              time_zone: d.time_zone ?? null,
            }
          : null,
      };
    } else if ("number" in p) result[key] = { number: p.number };
    else return fail("SYNC_REMOTE_INCOMPLETE", 502);
  }
  return result;
}
function normalizeDate(value: string) {
  return value.includes("T") ? new Date(value).toISOString() : value;
}
export const matches = (page: RemotePage, payload: Properties) =>
  same(
    normalized(page.properties, Object.keys(payload)),
    normalized(payload, Object.keys(payload)),
  );
export function projectPage(page: RemotePage, scope: SourceScope): RemotePage {
  const ids = Object.values(scope.columns).filter(
    (v): v is string => v !== null,
  );
  // Never persist or display unrelated property values/page bodies.
  return {
    ...page,
    properties: Object.fromEntries(ids.map((id) => [id, page.properties[id]])),
  };
}
export function stableValue(page: RemotePage, property: string): string {
  const n = normalized(page.properties, [property])[property] as {
    rich_text: string;
  };
  return n.rich_text;
}
