export type OperatorIncidentDigestRow = {
  direction: string;
  integration: string;
  errorClass: string;
};

export type OperatorJobFailureDigestRow = {
  jobFamily: string;
  jobKey: string;
  lastFailureAt: string;
};

export type OperatorHealthDigestWindow = {
  auditErrorCount: number;
  hadResolveAll: boolean;
  incidentsOpened: OperatorIncidentDigestRow[];
  incidentsResolved: OperatorIncidentDigestRow[];
  jobFailures: OperatorJobFailureDigestRow[];
};

export type OperatorHealthDigestReadPort = {
  readWindow(windowStartIso: string, windowEndIso: string): Promise<OperatorHealthDigestWindow>;
};
