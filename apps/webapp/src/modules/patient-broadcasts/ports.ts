export type PatientBroadcastView = {
  title: string;
  body: string;
  executedAt: string;
};

export type PatientBroadcastsPort = {
  getBroadcastForPatient(auditId: string, platformUserId: string): Promise<PatientBroadcastView | null>;
};
