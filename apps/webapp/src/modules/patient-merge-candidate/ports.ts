export type PatientMergeCandidateStatus = "pending" | "resolved" | "dismissed";

export type PatientMergeCandidateRecord = {
  id: string;
  organizationId: string;
  anchorUserId: string;
  candidateUserId: string;
  reason: string;
  status: PatientMergeCandidateStatus;
  triggerAppointmentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type PatientMergeCandidatePort = {
  upsertPendingCandidate(input: {
    organizationId: string;
    anchorUserId: string;
    candidateUserId: string;
    reason: string;
    triggerAppointmentId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<PatientMergeCandidateRecord>;
  listPendingByOrganization(organizationId: string, limit?: number): Promise<PatientMergeCandidateRecord[]>;
  dismissCandidate(id: string, resolvedBy: string): Promise<boolean>;
  markResolvedForUserPair(
    anchorUserId: string,
    candidateUserId: string,
    resolvedBy: string,
  ): Promise<number>;
};
