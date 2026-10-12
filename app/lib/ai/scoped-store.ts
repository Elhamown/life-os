import "server-only";
import type { Store } from "../private/store";
import { PrivateError } from "../private/errors";
import { aiAreas, allowedArea, type AiArea, type AiProposal } from "./model";
import { authorizedItems } from "./validation";

export const aiSlot = (kind: "context" | "proposals", area: AiArea) =>
  `ai-${kind}:${area}`;
export function requireAiArea(value: unknown): AiArea {
  if (!allowedArea(value)) throw new PrivateError("AI_CONSENT_REQUIRED", 400);
  return value;
}
export async function scopedContext(store: Store, area: AiArea) {
  const current = await store.get<unknown>(aiSlot("context", area));
  // Legacy data stays untouched. Only records from the explicitly selected area escape.
  const items = authorizedItems(
    current ?? (await store.get<unknown>("ai-context")) ?? [],
  );
  if (current !== null && items.some((item) => item.spaceId !== area))
    throw new PrivateError("AI_BOUNDARY_DENIED", 403);
  return items.filter((item) => item.spaceId === area);
}
export async function scopedProposals(
  store: Store,
  area: AiArea,
): Promise<AiProposal[]> {
  const legacy = (await store.get<AiProposal[]>("ai-proposals")) ?? [];
  const current =
    (await store.get<AiProposal[]>(aiSlot("proposals", area))) ?? [];
  if (
    !Array.isArray(legacy) ||
    !Array.isArray(current) ||
    current.some((p) => p.spaceId !== area)
  )
    throw new PrivateError("AI_BOUNDARY_DENIED", 403);
  return [
    ...new Map(
      [...legacy.filter((p) => p.spaceId === area), ...current].map((p) => [
        p.id,
        p,
      ]),
    ).values(),
  ];
}
// This aggregate is only for the authenticated owner's explicit sync review.
// Never pass it to an external AI provider.
export async function ownerProposals(store: Store): Promise<AiProposal[]> {
  const scoped = await Promise.all(
    aiAreas.map((area) => scopedProposals(store, area)),
  );
  return [...new Map(scoped.flat().map((p) => [p.id, p])).values()];
}
