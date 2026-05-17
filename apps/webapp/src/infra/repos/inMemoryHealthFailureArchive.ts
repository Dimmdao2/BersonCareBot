import type {
  HealthFailureArchiveClearBatchResult,
  HealthFailureArchiveListResult,
  HealthFailureArchivePort,
} from "@/modules/operator-health/healthFailureArchivePort";
/** In-memory заглушка (Vitest / CI без БД). */
export const inMemoryHealthFailureArchivePort: HealthFailureArchivePort = {
  async archiveOutgoingDeadBatch(): Promise<HealthFailureArchiveClearBatchResult> {
    return { inserted: 0, deleted: 0 };
  },
  async archiveIntegratorPushOutboxDeadBatch(): Promise<HealthFailureArchiveClearBatchResult> {
    return { inserted: 0, deleted: 0 };
  },
  async listForAdmin(): Promise<HealthFailureArchiveListResult> {
    return { items: [], nextCursor: null };
  },
  async listForDoctor(): Promise<HealthFailureArchiveListResult> {
    return { items: [], nextCursor: null };
  },
  async deleteArchivedBefore(): Promise<number> {
    return 0;
  },
};
