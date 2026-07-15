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

export async function loadReferenceItems(categoryCode: string): Promise<ReferenceItemDto[]> {
  if (typeof window === "undefined") return [];
  const res = await fetch(`/api/doctor/references/${encodeURIComponent(categoryCode)}`);
  if (!res.ok) return [];
  try {
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
