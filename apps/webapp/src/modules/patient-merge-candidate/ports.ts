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
  contacts: Array<{ kind: string; value: string }>;
};

export type PatientMergeConflictActor = {
  userId: string;
  displayName: string;
};

export type PatientMergeConflictDetails = {
  id: string;
  organizationId: string;
  createdAt: string;
  source: string;
  /** Врач этой клиники уже нажал «слить», и пара ждёт решения второй клиники. */
  doctorApproved: boolean;
  status: PatientMergeCandidateStatus;
  resolvedAt: string | null;
  resolvedBy: PatientMergeConflictActor | null;
  doctorComment: string | null;
  supportRequested: boolean | null;
  initiatedBy: PatientMergeConflictActor | null;
  parties: [PatientMergeConflictParty, PatientMergeConflictParty];
};

export type PatientMergeConflictRefusalSummary = {
  id: string;
  resolvedAt: string;
};

/**
 * Чем кончилось нажатие врачом «слить». `merged` — учётки объединены; `awaiting_other_organization`
 * — одобрение врача записано, но слияния НЕ было: у пары есть медицинский блокер второй клиники, и
 * снять его может только её врач; `conflict_not_found` — незакрытого конфликта этой клиники нет;
 * `fio_decision_required` — ФИО сторон расходится, а ответа человека, какой вариант правильный
 * (§18а), у нас нет: слить, выбрав подпись за него, нельзя, человека нужно спросить заново.
 */
export type PatientMergeConflictMergeOutcome =
  | 'merged'
  | 'awaiting_other_organization'
  | 'conflict_not_found'
  | 'fio_decision_required';

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
  doctorComment: string | null;
  supportRequested: boolean | null;
};

export type PatientMergeCandidatePort = {
  listPendingByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<PatientMergeCandidateRecord[]>;
  listPendingMedicalByOrganization(organizationId: string): Promise<PatientMergeCandidateRecord[]>;
  readMedicalConflictDetails(
    organizationId: string,
    conflictId: string,
  ): Promise<PatientMergeConflictDetails | null>;
  listMedicalConflictRefusalsForUser(
    organizationId: string,
    userId: string,
  ): Promise<PatientMergeConflictRefusalSummary[]>;
  mergeMedicalConflict(
    organizationId: string,
    conflictId: string,
    resolvedBy: string,
    doctorComment: string,
  ): Promise<PatientMergeConflictMergeOutcome>;
  refuseMedicalConflict(
    organizationId: string,
    conflictId: string,
    resolvedBy: string,
    doctorComment: string,
    supportRequested: boolean,
  ): Promise<boolean>;
  dismissCandidate(id: string, resolvedBy: string): Promise<boolean>;
  markResolvedForUserPair(
    organizationId: string,
    anchorUserId: string,
    candidateUserId: string,
    resolvedBy: string,
  ): Promise<number>;
};
