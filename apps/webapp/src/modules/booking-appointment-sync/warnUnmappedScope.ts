import type { CanonicalScopeRefs } from "./mergeCanonicalRefs";

export function warnUnmappedScopeRefs(params: {
  externalRubitimeId: string;
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  rubitimeCooperatorId: string | null;
  resolved: CanonicalScopeRefs;
  merged: CanonicalScopeRefs;
  existing?: CanonicalScopeRefs;
}): void {
  const warnings: string[] = [];
  if (params.rubitimeBranchId && !params.resolved.branchId) {
    warnings.push(`branch rubitime=${params.rubitimeBranchId}`);
  }
  if (params.rubitimeCooperatorId && !params.resolved.specialistId) {
    warnings.push(`specialist rubitime=${params.rubitimeCooperatorId}`);
  }
  if (params.rubitimeServiceId && !params.resolved.serviceId) {
    warnings.push(`service rubitime=${params.rubitimeServiceId}`);
  }
  if (warnings.length === 0) return;
  console.warn("[appointment-mirror] partial scope mapping", {
    externalRubitimeId: params.externalRubitimeId,
    unmapped: warnings,
    preserved: params.existing ?? params.merged,
  });
}
