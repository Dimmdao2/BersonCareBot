/** Contract: integration-wide data-quality incidents (Stage 3+). */
export type IntegrationDataQualityErrorReason =
  | "invalid_datetime"
  | "invalid_timezone"
  | "unsupported_format"
  | "invalid_branch_id"
  | "query_failed"
  | "missing_or_empty"
  | "invalid_iana";

export type IntegrationDataQualityIncidentStatus = "open" | "resolved";

export type IntegrationDataQualityIncidentField = "recordAt" | "dateTimeEnd" | string;

export type IntegrationDataQualityIncidentInput = {
  integration: string;
  entity: string;
  externalId: string;
  field: IntegrationDataQualityIncidentField;
  rawValue: string | null;
  timezoneUsed: string | null;
  errorReason: IntegrationDataQualityErrorReason;
};

export type UpsertIntegrationDataQualityIncidentResult = {
  occurrences: number;
};
