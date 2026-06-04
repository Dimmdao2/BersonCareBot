import type {
  LinkRubitimeMappingInput,
  LinkRubitimeMappingResult,
  ResolveRubitimeSsaDuplicateInput,
  ResolveRubitimeSsaDuplicateResult,
  RubitimeSsaDuplicateSummary,
  RubitimeMappingSummary,
} from "./types";

export type ListRubitimeMappingQuery = {
  organizationId: string;
  problemsOnly?: boolean;
  branchId?: string;
  serviceId?: string;
};

export type RubitimeMappingPort = {
  listMappings(query: ListRubitimeMappingQuery): Promise<RubitimeMappingSummary>;
  linkMapping(input: LinkRubitimeMappingInput): Promise<LinkRubitimeMappingResult>;
  listSsaDuplicates(input: { organizationId: string }): Promise<RubitimeSsaDuplicateSummary>;
  resolveSsaDuplicate(input: ResolveRubitimeSsaDuplicateInput): Promise<ResolveRubitimeSsaDuplicateResult>;
};

export type RubitimeMappingService = {
  listMappings(query: Omit<ListRubitimeMappingQuery, "organizationId"> & { organizationId: string }): Promise<RubitimeMappingSummary>;
  linkMapping(input: LinkRubitimeMappingInput): Promise<LinkRubitimeMappingResult>;
  listSsaDuplicates(input: { organizationId: string }): Promise<RubitimeSsaDuplicateSummary>;
  resolveSsaDuplicate(input: ResolveRubitimeSsaDuplicateInput): Promise<ResolveRubitimeSsaDuplicateResult>;
};
