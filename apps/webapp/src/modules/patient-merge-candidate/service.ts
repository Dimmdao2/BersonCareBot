import type { PatientMergeCandidatePort, PatientMergeCandidateRecord } from './ports';

export function createPatientMergeCandidateService(port: PatientMergeCandidatePort) {
  return {
    upsertPending(
      input: Parameters<PatientMergeCandidatePort['upsertPendingCandidate']>[0],
    ): Promise<PatientMergeCandidateRecord> {
      return port.upsertPendingCandidate(input);
    },
    listPending(organizationId: string, limit?: number): Promise<PatientMergeCandidateRecord[]> {
      return port.listPendingByOrganization(organizationId, limit);
    },
    async medicalConflictSummary(organizationId: string) {
      const conflicts = await port.listPendingMedicalByOrganization(organizationId);
      return {
        hasConflicts: conflicts.length > 0,
        conflictIds: conflicts.map((row) => row.id),
        clientIds: [
          ...new Set(conflicts.flatMap((row) => [row.anchorUserId, row.candidateUserId])),
        ],
      };
    },
    readMedicalConflictDetails(organizationId: string, conflictId: string) {
      return port.readMedicalConflictDetails(organizationId, conflictId);
    },
    mergeMedicalConflict(organizationId: string, conflictId: string, resolvedBy: string) {
      return port.mergeMedicalConflict(organizationId, conflictId, resolvedBy);
    },
    refuseMedicalConflict(organizationId: string, conflictId: string, resolvedBy: string) {
      return port.refuseMedicalConflict(organizationId, conflictId, resolvedBy);
    },
    dismiss(id: string, resolvedBy: string): Promise<boolean> {
      return port.dismissCandidate(id, resolvedBy);
    },
    markResolvedForUserPair(
      organizationId: string,
      anchorUserId: string,
      candidateUserId: string,
      resolvedBy: string,
    ): Promise<number> {
      return port.markResolvedForUserPair(
        organizationId,
        anchorUserId,
        candidateUserId,
        resolvedBy,
      );
    },
  };
}

export type PatientMergeCandidateService = ReturnType<typeof createPatientMergeCandidateService>;
