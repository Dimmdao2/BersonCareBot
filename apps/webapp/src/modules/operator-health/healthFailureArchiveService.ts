import {
  HEALTH_FAILURE_ARCHIVE_CLEAR_BATCH_SIZE,
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS,
  type HealthFailureArchiveProbe,
} from "./healthFailureArchiveConstants";
import type { HealthFailureArchivePort } from "./healthFailureArchivePort";

export function createHealthFailureArchiveService(port: HealthFailureArchivePort) {
  return {
    async clearDeadForProbe(input: {
      probe: HealthFailureArchiveProbe;
      archivedByUserId: string;
    }): Promise<{ inserted: number; deleted: number }> {
      let inserted = 0;
      let deleted = 0;
      const limit = HEALTH_FAILURE_ARCHIVE_CLEAR_BATCH_SIZE;
      if (input.probe === HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE) {
        for (;;) {
          const batch = await port.archiveOutgoingDeadBatch({
            limit,
            archivedByUserId: input.archivedByUserId,
          });
          inserted += batch.inserted;
          deleted += batch.deleted;
          if (batch.deleted === 0) break;
        }
      } else {
        for (;;) {
          const batch = await port.archiveIntegratorPushOutboxDeadBatch({
            limit,
            archivedByUserId: input.archivedByUserId,
          });
          inserted += batch.inserted;
          deleted += batch.deleted;
          if (batch.deleted === 0) break;
        }
      }
      return { inserted, deleted };
    },

    listForAdmin: port.listForAdmin.bind(port),
    listForDoctor: port.listForDoctor.bind(port),

    async purgeExpired(): Promise<{ deleted: number }> {
      const cutoff = new Date(Date.now() - HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS * 86400000).toISOString();
      const deleted = await port.deleteArchivedBefore(cutoff);
      return { deleted };
    },
  };
}
