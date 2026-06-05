export type CanonicalScopeRefs = {
  branchId: string | null;
  specialistId: string | null;
  serviceId: string | null;
};

/** Keep existing FK when Rubitime mapping does not resolve an id (partial update policy). */
export function mergeCanonicalRefsPreserveExisting(
  existing: CanonicalScopeRefs,
  resolved: CanonicalScopeRefs,
): CanonicalScopeRefs {
  return {
    branchId: resolved.branchId ?? existing.branchId,
    specialistId: resolved.specialistId ?? existing.specialistId,
    serviceId: resolved.serviceId ?? existing.serviceId,
  };
}
