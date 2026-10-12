import { validWorkspace, type Workspace } from "./workspace-schema";
// Legacy browser data is never authoritative and is never imported automatically.
// Retain the old key so the owner can review/export earlier work explicitly.
export function legacyWorkspace(): Workspace | null {
  const raw = localStorage.getItem("madar-workspace-v1");
  if (raw === null) return null;
  const data: unknown = { schemaVersion: 1, state: JSON.parse(raw) };
  if (!validWorkspace(data)) throw new Error("LEGACY_WORKSPACE_INVALID");
  return data;
}
