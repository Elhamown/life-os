import type { State } from "./model";
import { initialState, spaces } from "./model";

// Browser-only persistence for the prototype workspace. This is not Notion sync
// and must never contain API keys, tokens or authentication credentials.
const KEY = "madar-workspace-v1";
const validSpaces = new Set(spaces.map((space) => space.id));
const text = (value: unknown) => typeof value === "string" && value.length <= 1000;
const validTask = (item: unknown) => {
  if (!item || typeof item !== "object") return false;
  const t = item as Record<string, unknown>;
  return text(t.id) && text(t.title) && validSpaces.has(t.spaceId as typeof spaces[number]["id"]) &&
    typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
    typeof t.priority === "boolean" && typeof t.done === "boolean";
};
const validNote = (item: unknown) => {
  if (!item || typeof item !== "object") return false;
  const n = item as Record<string, unknown>;
  return text(n.id) && text(n.title) && validSpaces.has(n.spaceId as typeof spaces[number]["id"]);
};
const validProposal = (item: unknown) => {
  if (!item || typeof item !== "object") return false;
  const p = item as Record<string, unknown>;
  return validNote(p) && typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
    text(p.reason) && ["pending", "approved", "rejected"].includes(String(p.status));
};
export function readWorkspace(): State {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return initialState;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return initialState;
    const s = parsed as Record<string, unknown>;
    if (!Array.isArray(s.tasks) || s.tasks.length > 5000 || !s.tasks.every(validTask) ||
        !Array.isArray(s.notes) || s.notes.length > 5000 || !s.notes.every(validNote) ||
        !Array.isArray(s.proposals) || s.proposals.length > 5000 || !s.proposals.every(validProposal)) return initialState;
    return s as State;
  } catch {
    return initialState;
  }
}
export function saveWorkspace(state: State): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
