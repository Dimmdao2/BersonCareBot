import type {
  LinkRubitimeMappingInput,
  LinkRubitimeMappingResult,
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
};

export type RubitimeMappingService = {
  listMappings(query: Omit<ListRubitimeMappingQuery, "organizationId"> & { organizationId: string }): Promise<RubitimeMappingSummary>;
  linkMapping(input: LinkRubitimeMappingInput): Promise<LinkRubitimeMappingResult>;
};
