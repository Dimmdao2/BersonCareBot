import type { PatientMergeCandidatePort, PatientMergeCandidateRecord } from "./ports";

export function createPatientMergeCandidateService(port: PatientMergeCandidatePort) {
  return {
    upsertPending(
      input: Parameters<PatientMergeCandidatePort["upsertPendingCandidate"]>[0],
    ): Promise<PatientMergeCandidateRecord> {
      return port.upsertPendingCandidate(input);
    },
    listPending(organizationId: string, limit?: number): Promise<PatientMergeCandidateRecord[]> {
      return port.listPendingByOrganization(organizationId, limit);
    },
    dismiss(id: string, resolvedBy: string): Promise<boolean> {
      return port.dismissCandidate(id, resolvedBy);
    },
    markResolvedForUserPair(anchorUserId: string, candidateUserId: string, resolvedBy: string): Promise<number> {
      return port.markResolvedForUserPair(anchorUserId, candidateUserId, resolvedBy);
    },
  };
}

export type PatientMergeCandidateService = ReturnType<typeof createPatientMergeCandidateService>;
