/**
 * Doctor catalog loader. Intentionally uncached: a tab may change authenticated workspace, and a
 * category-only sessionStorage key could replay one clinic's catalog into another clinic.
 */
export type ReferenceItemDto = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
};

/**
 * Never rejects: a transient fetch failure (dropped connection, dev-server restart, offline tab)
 * must resolve to an empty list instead of leaving the caller's `.then()` unfired forever — a caller
 * that only chains `.then()` (no `.catch()`) would otherwise get stuck in its "loading" state with no
 * way out and no error surfaced to the user.
 */
export async function loadReferenceItems(categoryCode: string): Promise<ReferenceItemDto[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch(`/api/doctor/references/${encodeURIComponent(categoryCode)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; items?: ReferenceItemDto[] };
    if (!data.ok || !Array.isArray(data.items)) return [];
    return data.items;
  } catch {
    return [];
  }
}

export function clearReferenceCache(categoryCode?: string): void {
  void categoryCode;
}
