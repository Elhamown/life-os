import type { SpaceId } from "../model";
import type { AuditView, DiscoveryJob, DuplicateGroup, Mapping } from "./types";
import { PrivateError } from "../private/errors";
export const SCOPE =
  "هذا جرد لبيانات وصفية أعادها بحث Notion ومصادر متاحة داخل حاوياتها فقط. قد تتأخر فهرسة البحث أو تكون النتائج جزئية. ليس مسحًا كاملًا لمساحة العمل؛ الصفحات غير المشتركة والمحتوى النصي وسجلات الجداول خارج هذا الجرد.";
const keywords: [SpaceId, string[]][] = [
  ["ministry", ["وزار", "ministry"]],
  ["stardust", ["ستاردست", "stardust"]],
  ["studio", ["استوديو", "السلام", "studio"]],
  ["studies", ["دراس", "studies", "study"]],
  ["reading", ["كتاب", "كتب", "قراء", "reading", "books"]],
  ["courses", ["دور", "courses", "course"]],
  ["health", ["صح", "عادات", "habit", "health"]],
  ["life", ["شخصي", "personal", "life"]],
];
export function auditView(job: DiscoveryJob): AuditView {
  const sources = job.items.filter(
    (i) => i.kind === "data_source" && i.verified,
  );
  const duplicates: DuplicateGroup[] = [];
  const schemaGroups = new Map<string, string[]>();
  const titleGroups = new Map<string, string[]>();
  const normalize = (text: string) =>
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\u064B-\u065F]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  for (const s of sources) {
    const titleKey = normalize(s.title);
    if (titleKey)
      titleGroups.set(titleKey, [...(titleGroups.get(titleKey) ?? []), s.id]);
    if (s.schema.length >= 2) {
      const schemaKey = JSON.stringify(
        s.schema.map((p) => [normalize(p.name), p.type]).sort(),
      );
      schemaGroups.set(schemaKey, [
        ...(schemaGroups.get(schemaKey) ?? []),
        s.id,
      ]);
    }
  }
  for (const [reason, groups] of [
    ["schema", schemaGroups],
    ["title", titleGroups],
  ] as const)
    for (const ids of groups.values())
      if (ids.length > 1) duplicates.push({ ids, reason });
  const suggestions = sources.map((s) => {
    const matches = keywords.filter(([, words]) =>
      words.some((w) => normalize(s.title).includes(w)),
    );
    return {
      sourceId: s.id,
      area: matches.length === 1 ? matches[0][0] : null,
      reason:
        matches.length === 1
          ? "اقتراح محلي من اسم المصدر فقط؛ يحتاج مراجعتك."
          : "لا توجد إشارة واضحة أو يوجد أكثر من مجال؛ اختر يدويًا.",
    };
  });
  return {
    id: job.id,
    revision: job.revision,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    status: job.status,
    items: job.items,
    warnings: job.warnings,
    retryAt:
      job.retryAt && Date.parse(job.retryAt) > Date.now() ? job.retryAt : null,
    suggestions,
    duplicates,
    scope: SCOPE,
  };
}
export function approveMappings(
  job: DiscoveryJob,
  previous: Mapping[],
  input: unknown,
  expectedId: unknown,
  expectedRevision: unknown,
  acknowledged: unknown,
  now = new Date().toISOString(),
): Mapping[] {
  if (job.id !== expectedId || job.revision !== expectedRevision)
    throw new PrivateError("REPORT_CHANGED", 409);
  if (
    job.status === "running" ||
    acknowledged !== true ||
    !Array.isArray(input) ||
    input.length > 1000
  )
    throw new PrivateError("MAPPING_REVIEW_REQUIRED", 400);
  const approved: Mapping[] = [];
  const seen = new Set<string>();
  for (const row of input) {
    if (!row || typeof row !== "object")
      throw new PrivateError("INVALID_MAPPING", 400);
    const { sourceId, area } = row as Record<string, unknown>;
    if (
      typeof sourceId !== "string" ||
      typeof area !== "string" ||
      seen.has(sourceId) ||
      !keywords.some(([id]) => id === area) ||
      !job.items.some(
        (i) => i.id === sourceId && i.kind === "data_source" && i.verified,
      )
    )
      throw new PrivateError("INVALID_MAPPING", 400);
    seen.add(sourceId);
    approved.push({
      sourceId,
      area: area as SpaceId,
      aiIngestion: false,
      approvedAt: now,
      reportId: job.id,
    });
  }
  // Upsert approved mappings only; retain older inaccessible/unchecked entries without changing them.
  return [...previous.filter((m) => !seen.has(m.sourceId)), ...approved];
}
export function canIngestNotionIntoAi(mapping: Mapping): false {
  void mapping;
  return false;
}
