export type ReverseMappingLookup = {
  resolveRubitimeId(
    entityType: "branch" | "specialist" | "service" | "availability",
    canonicalId: string,
  ): string | null;
};

export function buildReverseMappingLookup(
  rows: { entityType: string; externalId: string; canonicalId: string }[],
): ReverseMappingLookup {
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(`${r.entityType}:${r.canonicalId}`, r.externalId);
  }
  return {
    resolveRubitimeId(entityType, canonicalId) {
      return map.get(`${entityType}:${canonicalId}`) ?? null;
    },
  };
}

export function parseRubitimeNumericId(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}
