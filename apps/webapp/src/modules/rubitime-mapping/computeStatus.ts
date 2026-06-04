import type { RubitimeMappingStatusCode } from "./types";

const STATUS_RANK: Record<RubitimeMappingStatusCode, number> = {
  unmapped: 1,
  ssa_missing: 2,
  reverse_missing: 3,
  branch_unmapped: 4,
  specialist_unmapped: 5,
  service_unmapped: 6,
  legacy_inactive: 7,
  duration_mismatch: 8,
  price_mismatch: 9,
  mapped_ok: 10,
};

export type MappingStatusContext = {
  branchServiceId: string | null;
  ssaActive: boolean;
  ssaPresent: boolean;
  reverseMappingOk: boolean;
  branchEntityMapped: boolean;
  specialistEntityMapped: boolean;
  serviceEntityMapped: boolean;
  legacyActive: boolean;
  durationMismatch: boolean;
  priceMismatch: boolean;
};

export function computeRubitimeMappingStatus(ctx: MappingStatusContext): {
  status: RubitimeMappingStatusCode;
  issues: string[];
} {
  const blockers: RubitimeMappingStatusCode[] = [];
  const warnings: RubitimeMappingStatusCode[] = [];

  if (!ctx.branchServiceId) blockers.push("unmapped");
  if (!ctx.ssaPresent || !ctx.ssaActive) blockers.push("ssa_missing");
  if (ctx.branchServiceId && !ctx.reverseMappingOk) blockers.push("reverse_missing");
  if (!ctx.branchEntityMapped) blockers.push("branch_unmapped");
  if (!ctx.specialistEntityMapped) blockers.push("specialist_unmapped");
  if (!ctx.serviceEntityMapped) blockers.push("service_unmapped");
  if (ctx.branchServiceId && !ctx.legacyActive) blockers.push("legacy_inactive");
  if (ctx.durationMismatch) warnings.push("duration_mismatch");
  if (ctx.priceMismatch) warnings.push("price_mismatch");

  const primary =
    blockers.sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0] ??
    (warnings.length > 0 ? "mapped_ok" : "mapped_ok");

  const issues: string[] = [];
  if (primary === "mapped_ok") {
    for (const code of warnings) {
      if (code === "duration_mismatch") issues.push("duration_mismatch");
      if (code === "price_mismatch") issues.push("price_mismatch");
    }
    return { status: "mapped_ok", issues };
  }

  return { status: primary, issues };
}

export function countMappingProblems(rows: { status: RubitimeMappingStatusCode; issues: string[] }[]): {
  total: number;
  mappedOk: number;
  problems: number;
} {
  let mappedOk = 0;
  let problems = 0;
  for (const row of rows) {
    if (row.status === "mapped_ok" && row.issues.length === 0) mappedOk += 1;
    else problems += 1;
  }
  return { total: rows.length, mappedOk, problems };
}
