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
