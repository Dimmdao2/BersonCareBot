export const RUBITIME_MAPPING_STATUS_CODES = [
  "unmapped",
  "ssa_missing",
  "reverse_missing",
  "branch_unmapped",
  "specialist_unmapped",
  "service_unmapped",
  "legacy_inactive",
  "duration_mismatch",
  "price_mismatch",
  "mapped_ok",
] as const;

export type RubitimeMappingStatusCode = (typeof RUBITIME_MAPPING_STATUS_CODES)[number];

/** Populated when list API detects duration/price drift between canonical and linked Rubitime row. */
export type RubitimeMappingIssueDetails = {
  durationMismatch?: { canonicalMinutes: number; legacyMinutes: number };
  priceMismatch?: { canonicalPriceMinor: number; legacyPriceMinor: number };
};

export type RubitimeMappingRow = {
  branchId: string;
  branchTitle: string;
  serviceId: string;
  serviceTitle: string;
  rubitimeBranchTitle: string | null;
  rubitimeSpecialistName: string | null;
  rubitimeServiceTitle: string | null;
  status: RubitimeMappingStatusCode;
  issues: string[];
  issueDetails?: RubitimeMappingIssueDetails;
  branchServiceId: string | null;
};

export type RubitimeMappingSummary = {
  total: number;
  mappedOk: number;
  problems: number;
  rows: RubitimeMappingRow[];
};

export type LinkRubitimeMappingInput = {
  organizationId: string;
  branchId: string;
  serviceId: string;
  specialistId: string;
  legacyBranchId: string;
  legacyServiceId: string;
  legacySpecialistId: string;
  rubitimeServiceId: string;
  isActive?: boolean;
};

export type LinkRubitimeMappingResult = {
  branchServiceId: string;
  ssaId: string;
};

export type RubitimeSsaDuplicateRow = {
  ssaId: string;
  specialistId: string;
  specialistName: string | null;
  isActive: boolean;
  createdAt: string;
  cityCode: string | null;
  hasMapping: boolean;
  rubitimeServiceId: string | null;
  legacyBranchServiceId: string | null;
};

export type RubitimeSsaDuplicateGroup = {
  branchId: string;
  branchTitle: string;
  serviceId: string;
  serviceTitle: string;
  specialistId: string;
  specialistName: string | null;
  recommendedKeepSsaId: string;
  rows: RubitimeSsaDuplicateRow[];
};

export type RubitimeSsaDuplicateSummary = {
  totalGroups: number;
  groups: RubitimeSsaDuplicateGroup[];
};

export type ResolveRubitimeSsaDuplicateInput = {
  organizationId: string;
  branchId: string;
  serviceId: string;
  specialistId: string;
  keepSsaId: string;
  transferMappingToKeep?: boolean;
};

export type ResolveRubitimeSsaDuplicateResult = {
  branchId: string;
  serviceId: string;
  specialistId: string;
  keepSsaId: string;
  deactivatedIds: string[];
  transferredMapping: boolean;
};
