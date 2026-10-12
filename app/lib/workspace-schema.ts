import { emptyState, spaces, type State } from "./model";
export type Workspace = { schemaVersion: 1; state: State };
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown) =>
  typeof x === "string" && x.trim().length > 0 && x.length <= 1000;
const date = (x: unknown) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
const base = (x: unknown): x is Record<string, unknown> =>
  object(x) &&
  text(x.id) &&
  text(x.title) &&
  spaces.some((s) => s.id === x.spaceId);
function list(value: unknown, validate: (x: unknown) => boolean) {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every(validate) &&
    new Set(value.map((x) => x.id)).size === value.length
  );
}
export function validWorkspace(value: unknown): value is Workspace {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    Object.keys(value).some((k) => !["schemaVersion", "state"].includes(k)) ||
    !object(value.state)
  )
    return false;
  const s = value.state;
  if (
    !list(
      s.customSpaces ?? [],
      (x) =>
        object(x) &&
        Object.keys(x).every((k) => ["id", "title"].includes(k)) &&
        typeof x.id === "string" &&
        /^custom-[a-f\d-]{36}$/i.test(x.id) &&
        text(x.title),
    )
  )
    return false;
  const record = (x: unknown): x is Record<string, unknown> =>
    base(x) ||
    (object(x) &&
      text(x.id) &&
      text(x.title) &&
      Array.isArray(s.customSpaces) &&
      s.customSpaces.some((c) => object(c) && c.id === x.spaceId));
  if (
    Object.keys(s).some(
      (k) =>
        ![
          "tasks",
          "notes",
          "proposals",
          "projects",
          "events",
          "preferences",
          "habits",
          "goals",
          "customSpaces",
          "activity",
        ].includes(k),
    )
  )
    return false;
  if (
    Array.isArray(s.tasks) &&
    Array.isArray(s.notes) &&
    s.notes.some(
      (n) =>
        object(n) &&
        s.tasks instanceof Array &&
        s.tasks.some((t) => object(t) && t.id === n.id),
    )
  )
    return false;
  if (
    s.activity !== undefined &&
    (!Array.isArray(s.activity) ||
      s.activity.length > 50 ||
      !list(
        s.activity,
        (x) =>
          object(x) &&
          Object.keys(x).every((k) => ["id", "at", "label"].includes(k)) &&
          text(x.id) &&
          text(x.label) &&
          typeof x.at === "string" &&
          !Number.isNaN(Date.parse(x.at)),
      ))
  )
    return false;
  const keys = (x: Record<string, unknown>, allowed: string[]) =>
    Object.keys(x).every((k) => allowed.includes(k));
  return (
    list(
      s.tasks,
      (x) =>
        record(x) &&
        keys(x, [
          "id",
          "title",
          "spaceId",
          "date",
          "priority",
          "done",
          "projectId",
        ]) &&
        date(x.date) &&
        typeof x.priority === "boolean" &&
        typeof x.done === "boolean" &&
        (x.projectId === undefined ||
          (Array.isArray(s.projects) &&
            s.projects.some(
              (p) =>
                object(p) && p.id === x.projectId && p.spaceId === x.spaceId,
            ))),
    ) &&
    list(s.notes, (x) => record(x) && keys(x, ["id", "title", "spaceId"])) &&
    list(
      s.proposals,
      (x) =>
        record(x) &&
        keys(x, ["id", "title", "spaceId", "date", "reason", "status"]) &&
        date(x.date) &&
        text(x.reason) &&
        ["pending", "approved", "rejected"].includes(String(x.status)),
    ) &&
    list(
      s.projects ?? [],
      (x) =>
        record(x) &&
        keys(x, ["id", "title", "spaceId", "deadline", "notes"]) &&
        (x.deadline === "" || date(x.deadline)) &&
        typeof x.notes === "string" &&
        x.notes.length <= 1000,
    ) &&
    list(
      s.events ?? [],
      (x) =>
        record(x) &&
        keys(x, ["id", "title", "spaceId", "date", "time", "duration"]) &&
        date(x.date) &&
        typeof x.time === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) &&
        text(x.duration),
    ) &&
    list(
      s.habits ?? [],
      (x) =>
        record(x) &&
        keys(x, ["id", "title", "spaceId", "days"]) &&
        Array.isArray(x.days) &&
        x.days.length <= 3660 &&
        x.days.every(date) &&
        new Set(x.days).size === x.days.length,
    ) &&
    list(
      s.goals ?? [],
      (x) =>
        record(x) &&
        keys(x, ["id", "title", "spaceId", "deadline", "current", "target"]) &&
        (x.deadline === "" || date(x.deadline)) &&
        typeof x.current === "number" &&
        Number.isFinite(x.current) &&
        x.current >= 0 &&
        typeof x.target === "number" &&
        Number.isFinite(x.target) &&
        x.target > 0 &&
        x.current <= x.target,
    ) &&
    (s.preferences === undefined ||
      (object(s.preferences) &&
        keys(s.preferences, ["weekStarts"]) &&
        ["saturday", "monday"].includes(String(s.preferences.weekStarts))))
  );
}
export const newWorkspace = (): Workspace => ({
  schemaVersion: 1,
  state: structuredClone(emptyState),
});
