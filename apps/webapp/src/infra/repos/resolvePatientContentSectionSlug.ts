import type { ContentSectionRow } from "./pgContentSections";

export type PatientContentSectionSlugResolverDeps = {
  getBySlug: (slug: string) => Promise<ContentSectionRow | null>;
  getRedirectNewSlugForOldSlug: (oldSlug: string) => Promise<string | null>;
};

/**
 * Разрешает slug из URL к текущему slug строки в `content_sections` с учётом истории переименований.
 * Возвращает null если раздел не найден или скрыт от пациентов.
 */
export async function resolvePatientContentSectionSlug(
  deps: PatientContentSectionSlugResolverDeps,
  rawSlug: string,
  options?: { maxHops?: number },
): Promise<{ canonicalSlug: string; section: ContentSectionRow } | null> {
  let cur = rawSlug.trim();
  const maxHops = options?.maxHops ?? 25;
  for (let i = 0; i < maxHops; i += 1) {
    const row = await deps.getBySlug(cur);
    if (row) {
      if (!row.isVisible) return null;
      return { canonicalSlug: cur, section: row };
    }
    const next = await deps.getRedirectNewSlugForOldSlug(cur);
    if (!next) return null;
    cur = next.trim();
  }
  return null;
}
