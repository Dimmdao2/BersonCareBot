/** Pick the best SSA row when duplicates exist (same branch+service+specialist, e.g. NULL room_id in unique). */

export type SsaPickCandidate = {
  id: string;
  createdAt: string;
  isActive?: boolean;
};

/** Prefer active rows, then the newest `createdAt`. */
export function pickPreferredSsaId(candidates: readonly SsaPickCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const active = candidates.filter((c) => c.isActive !== false);
  const pool = active.length > 0 ? active : [...candidates];
  const sorted = [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted[0]?.id ?? null;
}
