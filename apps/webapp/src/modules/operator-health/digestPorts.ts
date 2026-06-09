export type OperatorIncidentDigestRow = {
  integration: string;
  errorClass: string;
};

export type OperatorJobFailureDigestRow = {
  jobFamily: string;
  jobKey: string;
  lastFailureAt: string;
};

export type OperatorHealthDigestReadPort = {
  countAuditErrorsInWindow(windowStartIso: string, windowEndIso: string): Promise<number>;
  hadOperatorIncidentsResolveAllInWindow(windowStartIso: string, windowEndIso: string): Promise<boolean>;
  listIncidentsOpenedInWindow(
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<OperatorIncidentDigestRow[]>;
  listIncidentsResolvedInWindow(
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<OperatorIncidentDigestRow[]>;
  listJobFailuresInWindow(
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<OperatorJobFailureDigestRow[]>;
};
