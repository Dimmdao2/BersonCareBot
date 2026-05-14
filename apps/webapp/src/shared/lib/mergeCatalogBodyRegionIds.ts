/** Объединяет legacy одну ссылку на `reference_items` и список из M2M в отсортированный уникальный массив UUID. */
export function mergeCatalogBodyRegionIds(
  legacyId: string | null | undefined,
  m2mIds: readonly string[] | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const x of m2mIds ?? []) {
    const t = typeof x === "string" ? x.trim() : "";
    if (t) set.add(t);
  }
  const leg = typeof legacyId === "string" ? legacyId.trim() : "";
  if (leg) set.add(leg);
  return [...set].sort((a, b) => a.localeCompare(b));
}
