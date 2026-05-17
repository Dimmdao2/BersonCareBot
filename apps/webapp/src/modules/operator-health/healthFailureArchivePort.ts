import type { HealthFailureArchiveProbe } from "./healthFailureArchiveConstants";

export type HealthFailureArchiveRow = {
  id: string;
  archivedAt: string;
  archivedByUserId: string | null;
  healthProbe: string;
  sourceKind: string;
  sourceId: string;
  severityAtArchive: string;
  doctorUserId: string | null;
  summaryJson: Record<string, unknown>;
  rawErrorTruncated: string | null;
};

export type HealthFailureArchiveClearBatchResult = {
  inserted: number;
  deleted: number;
};

export type HealthFailureArchiveListResult = {
  items: HealthFailureArchiveRow[];
  nextCursor: string | null;
};

/** Запись и выборка архива dead-очередей (`public.operator_health_failure_archive`). */
export type HealthFailureArchivePort = {
  archiveOutgoingDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult>;
  archiveIntegratorPushOutboxDeadBatch(input: {
    limit: number;
    archivedByUserId: string;
  }): Promise<HealthFailureArchiveClearBatchResult>;
  listForAdmin(input: {
    probe: HealthFailureArchiveProbe | null;
    limit: number;
    cursor: string | null;
  }): Promise<HealthFailureArchiveListResult>;
  listForDoctor(input: {
    doctorUserId: string;
    limit: number;
    cursor: string | null;
  }): Promise<HealthFailureArchiveListResult>;
  deleteArchivedBefore(cutoffIso: string): Promise<number>;
};
