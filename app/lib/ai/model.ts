import type { SpaceId } from "../model";
import { isSpace, spaceAccess } from "../access-policy";
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
  return isSpace(area) && spaceAccess[area].externalAi;
}
export const excludedArea = (area: SpaceId) => !spaceAccess[area].externalAi;
