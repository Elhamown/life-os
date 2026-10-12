import type { SpaceId } from "./model";

// One owner, separate data compartments. These are data boundaries, never user roles.
export type Compartment = "ministry" | "stardust" | "studio" | "personal";
export const spaceAccess: Record<
  SpaceId,
  { compartment: Compartment; externalAi: boolean }
> = {
  ministry: { compartment: "ministry", externalAi: false },
  stardust: { compartment: "stardust", externalAi: true },
  studio: { compartment: "studio", externalAi: true },
  studies: { compartment: "personal", externalAi: true },
  reading: { compartment: "personal", externalAi: true },
  courses: { compartment: "personal", externalAi: true },
  health: { compartment: "personal", externalAi: false },
  life: { compartment: "personal", externalAi: true },
};
export function isSpace(value: unknown): value is SpaceId {
  return typeof value === "string" && Object.hasOwn(spaceAccess, value);
}
export const compartmentNames: Record<Compartment, string> = {
  ministry: "الوزارة",
  stardust: "ستاردست",
  studio: "استوديو السلام",
  personal: "معلوماتي الشخصية",
};
