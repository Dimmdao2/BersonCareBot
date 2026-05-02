/** Values stored in `content_sections.kind`. */
export const CONTENT_SECTION_KINDS = ["article", "system"] as const;
export type ContentSectionKind = (typeof CONTENT_SECTION_KINDS)[number];

/** Non-null values for `content_sections.system_parent_code` (logical CMS folders / clusters). */
export const SYSTEM_PARENT_CODES = ["situations", "sos", "warmups", "lessons"] as const;
export type SystemParentCode = (typeof SYSTEM_PARENT_CODES)[number];

/** Built-in section slugs that must never be renamed (patient app / code references). */
export const IMMUTABLE_SYSTEM_SECTION_SLUGS = [
  "warmups",
  "lessons",
  "course_lessons",
  "emergency",
  "materials",
  "workouts",
] as const;
export type ImmutableSystemSectionSlug = (typeof IMMUTABLE_SYSTEM_SECTION_SLUGS)[number];

export function isImmutableSystemSectionSlug(slug: string): boolean {
  return (IMMUTABLE_SYSTEM_SECTION_SLUGS as readonly string[]).includes(slug.trim());
}

export function isSystemParentCode(value: string | null | undefined): value is SystemParentCode {
  if (value == null || value === "") return false;
  return (SYSTEM_PARENT_CODES as readonly string[]).includes(value);
}

export function isContentSectionKind(value: string | null | undefined): value is ContentSectionKind {
  if (value == null || value === "") return false;
  return (CONTENT_SECTION_KINDS as readonly string[]).includes(value);
}

/** Backfill intent for known slugs at migration time (matches CMS_RESTRUCTURE_PLAN). */
export function classifyExistingContentSectionSlug(slug: string): {
  kind: ContentSectionKind;
  systemParentCode: SystemParentCode | null;
} {
  const s = slug.trim();
  if (s === "warmups") return { kind: "system", systemParentCode: "warmups" };
  if (s === "lessons" || s === "course_lessons") return { kind: "system", systemParentCode: "lessons" };
  if (s === "emergency" || s === "materials" || s === "workouts") return { kind: "system", systemParentCode: null };
  return { kind: "article", systemParentCode: null };
}

/**
 * When creating a section inline from patient-home for a block that maps to a system cluster.
 * Returns null if inline section creation should not auto-set a parent code (e.g. subscription_carousel).
 */
export function systemParentCodeForPatientHomeBlock(
  code: string,
): SystemParentCode | null | undefined {
  if (code === "situations") return "situations";
  if (code === "sos") return "sos";
  if (code === "daily_warmup") return "warmups";
  return undefined;
}

/** Article sections cannot carry a cluster marker; system rows may. */
export function isValidSectionTaxonomy(
  kind: ContentSectionKind,
  systemParentCode: SystemParentCode | null,
): boolean {
  if (kind === "article") return systemParentCode == null;
  if (!isContentSectionKind(kind)) return false;
  return systemParentCode == null || isSystemParentCode(systemParentCode);
}

/** Form value for CMS placement (create/edit). `system_root` is only for built-in rows without a folder parent. */
export const CONTENT_SECTION_PLACEMENT_VALUES = [
  "article",
  "situations",
  "sos",
  "warmups",
  "lessons",
  "system_root",
] as const;
export type ContentSectionPlacementValue = (typeof CONTENT_SECTION_PLACEMENT_VALUES)[number];

export function isContentSectionPlacementValue(v: string): v is ContentSectionPlacementValue {
  return (CONTENT_SECTION_PLACEMENT_VALUES as readonly string[]).includes(v);
}

/** Map CMS placement control to DB taxonomy. Returns null if the string is not a known placement. */
export function taxonomyFromPlacement(
  placement: string,
): { kind: ContentSectionKind; systemParentCode: SystemParentCode | null } | null {
  if (!isContentSectionPlacementValue(placement)) return null;
  if (placement === "article") return { kind: "article", systemParentCode: null };
  if (placement === "system_root") return { kind: "system", systemParentCode: null };
  return { kind: "system", systemParentCode: placement };
}

export function placementFromTaxonomy(
  kind: ContentSectionKind,
  systemParentCode: SystemParentCode | null,
): ContentSectionPlacementValue {
  if (kind === "article") return "article";
  if (systemParentCode != null && isSystemParentCode(systemParentCode)) return systemParentCode;
  return "system_root";
}
