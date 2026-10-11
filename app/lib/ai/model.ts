import type { SpaceId } from "../model";
export const aiAreas = [
  "stardust",
  "studio",
  "studies",
  "reading",
  "courses",
  "life",
] as const;
export type AiArea = (typeof aiAreas)[number];
export type AiFields = {
  kind: "task" | "event" | "note" | "study";
  operation: "create";
  spaceId: AiArea;
  title: string;
  date: string | null;
  time: string | null;
  durationMinutes: number | null;
  details: string;
  contextIds: string[];
};
export type AiProposal = AiFields & {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
export type AuthorizedItem = {
  id: string;
  kind: "task" | "event";
  spaceId: AiArea;
  title: string;
  date: string;
  time: string | null;
  durationMinutes: number | null;
};
export function allowedArea(area: unknown): area is AiArea {
  return (
    typeof area === "string" && (aiAreas as readonly string[]).includes(area)
  );
}
export const excludedArea = (area: SpaceId) =>
  area === "ministry" || area === "health";
