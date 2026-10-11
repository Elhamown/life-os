import "server-only";
import { PrivateError } from "../private/errors";
import { allowedArea, type AiFields, type AuthorizedItem } from "./model";
const bad = () => {
  throw new PrivateError("AI_INVALID_DATA", 400);
};
export function text(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    return bad();
  return value.trim();
}
export function date(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    return bad();
  return value;
}
export function fields(value: unknown, context: AuthorizedItem[]): AiFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const v = value as Record<string, unknown>;
  const keys = [
    "kind",
    "operation",
    "spaceId",
    "title",
    "date",
    "time",
    "durationMinutes",
    "details",
    "contextIds",
  ];
  if (
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in v))
  )
    return bad();
  if (
    typeof v.kind !== "string" ||
    !["task", "event", "note", "study"].includes(v.kind) ||
    v.operation !== "create" ||
    !allowedArea(v.spaceId)
  )
    return bad();
  const day = date(v.date);
  if (
    v.time !== null &&
    (typeof v.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))
  )
    return bad();
  if (
    v.durationMinutes !== null &&
    (!Number.isInteger(v.durationMinutes) ||
      Number(v.durationMinutes) < 5 ||
      Number(v.durationMinutes) > 480)
  )
    return bad();
  if (
    (v.kind === "event" || v.kind === "study") &&
    (!day || !v.time || v.durationMinutes === null)
  )
    return bad();
  if (
    !Array.isArray(v.contextIds) ||
    v.contextIds.length > 20 ||
    v.contextIds.some(
      (id) => typeof id !== "string" || !context.some((c) => c.id === id),
    )
  )
    return bad();
  return {
    kind: v.kind as AiFields["kind"],
    operation: "create",
    spaceId: v.spaceId,
    title: text(v.title, 200),
    date: day,
    time: v.time as string | null,
    durationMinutes: v.durationMinutes as number | null,
    details: text(v.details, 1000, true),
    contextIds: [...new Set(v.contextIds as string[])],
  };
}
export function authorizedItems(value: unknown): AuthorizedItem[] {
  if (!Array.isArray(value) || value.length > 50) return bad();
  const ids = new Set<string>();
  return value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      !allowedArea(v.spaceId) ||
      !["task", "event"].includes(v.kind)
    )
      return bad();
    const id = text(v.id, 80);
    if (ids.has(id)) return bad();
    ids.add(id);
    const f = fields(
      {
        kind: v.kind,
        operation: "create",
        spaceId: v.spaceId,
        title: v.title,
        date: v.date,
        time: v.time,
        durationMinutes: v.durationMinutes,
        details: "",
        contextIds: [],
      },
      [],
    );
    if (!f.date) return bad();
    return {
      id,
      kind: v.kind,
      spaceId: f.spaceId,
      title: f.title,
      date: f.date,
      time: f.time,
      durationMinutes: f.durationMinutes,
    };
  });
}
export function planningReferences(value: unknown, context: AuthorizedItem[]) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some(
      (id) => typeof id !== "string" || !context.some((c) => c.id === id),
    )
  )
    return bad();
  return [...new Set(value as string[])];
}
