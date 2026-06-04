/** Pick the best SSA row when duplicates exist (same branch+service+specialist, e.g. NULL room_id in unique). */

export type SsaPickCandidate = {
  id: string;
  createdAt: string;
  isActive?: boolean;
};

export function legacyBranchServiceIdBySsaFromMappings(
  mappings: ReadonlyArray<{ canonicalId: string; metadata: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of mappings) {
    const legacyId = (m.metadata as { legacy_branch_service_id?: string } | null)?.legacy_branch_service_id;
    if (typeof legacyId === "string" && legacyId.length > 0) {
      map.set(m.canonicalId, legacyId);
    }
  }
  return map;
}

/** Prefer active rows with availability→legacy mapping, then newest `createdAt`. */
export function pickPreferredSsaId(
  candidates: readonly SsaPickCandidate[],
  legacyBranchServiceIdBySsaId: ReadonlyMap<string, string>,
): string | null {
  if (candidates.length === 0) return null;
  const active = candidates.filter((c) => c.isActive !== false);
  const pool = active.length > 0 ? active : [...candidates];
  const withMapping = pool.filter((c) => legacyBranchServiceIdBySsaId.has(c.id));
  const pickFrom = withMapping.length > 0 ? withMapping : pool;
  const sorted = [...pickFrom].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted[0]?.id ?? null;
}

export function legacyBranchServiceIdForSsaId(
  ssaId: string | null | undefined,
  legacyBranchServiceIdBySsaId: ReadonlyMap<string, string>,
): string | null {
  if (!ssaId) return null;
  const id = legacyBranchServiceIdBySsaId.get(ssaId);
  return id && id.length > 0 ? id : null;
}
