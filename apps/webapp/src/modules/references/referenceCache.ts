/**
 * Client-side cache for GET /api/references/:categoryCode (sessionStorage, one fetch per category per tab).
 */
const PREFIX = "bc_ref_";

export type ReferenceItemDto = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
};

export async function loadReferenceItems(categoryCode: string): Promise<ReferenceItemDto[]> {
  if (typeof window === "undefined") return [];
  const key = `${PREFIX}${categoryCode}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as ReferenceItemDto[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  const res = await fetch(`/api/references/${encodeURIComponent(categoryCode)}`);
  const data = (await res.json()) as { ok?: boolean; items?: ReferenceItemDto[] };
  if (!data.ok || !Array.isArray(data.items)) return [];
  try {
    sessionStorage.setItem(key, JSON.stringify(data.items));
  } catch {
    /* ignore quota */
  }
  return data.items;
}

export function clearReferenceCache(categoryCode?: string): void {
  if (typeof window === "undefined") return;
  if (categoryCode) {
    sessionStorage.removeItem(`${PREFIX}${categoryCode}`);
    return;
  }
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
  }
}
