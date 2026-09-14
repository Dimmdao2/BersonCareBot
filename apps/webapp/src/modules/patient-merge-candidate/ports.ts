export type PatientMergeCandidateStatus = 'pending' | 'resolved' | 'dismissed' | 'escalated';

export type PatientMergeConflictAssignment = {
  id: string;
  kind: 'treatment_program' | 'lfk_assignment';
  title: string;
  assignedAt: string;
  status: string;
};

export type PatientMergeConflictParty = {
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  lastActivityAt: string | null;
  assignments: PatientMergeConflictAssignment[];
};

export type PatientMergeConflictDetails = {
  id: string;
  organizationId: string;
  createdAt: string;
  source: string;
  parties: [PatientMergeConflictParty, PatientMergeConflictParty];
};

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
  listPendingByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<PatientMergeCandidateRecord[]>;
  listPendingMedicalByOrganization(organizationId: string): Promise<PatientMergeCandidateRecord[]>;
  readMedicalConflictDetails(
    organizationId: string,
    conflictId: string,
  ): Promise<PatientMergeConflictDetails | null>;
  mergeMedicalConflict(
    organizationId: string,
    conflictId: string,
    resolvedBy: string,
  ): Promise<boolean>;
  refuseMedicalConflict(
    organizationId: string,
    conflictId: string,
    resolvedBy: string,
  ): Promise<boolean>;
  dismissCandidate(id: string, resolvedBy: string): Promise<boolean>;
  markResolvedForUserPair(
    organizationId: string,
    anchorUserId: string,
    candidateUserId: string,
    resolvedBy: string,
  ): Promise<number>;
};
