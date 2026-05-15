import type { BroadcastAuditEntry, DoctorBroadcastDeliveryCommitPort } from "@/modules/doctor-broadcasts/ports";
import { pushInMemoryBroadcastAuditEntry } from "./inMemoryBroadcastAudit";

export function createInMemoryDoctorBroadcastDeliveryCommitPort(): DoctorBroadcastDeliveryCommitPort {
  return {
    async commitAuditAndDeliveryQueue({ auditId, audit, jobs }) {
      const executedAt = new Date().toISOString();
      const entry: BroadcastAuditEntry = {
        ...audit,
        id: auditId,
        executedAt,
        deliveryJobsTotal: jobs.length,
        messageBody: audit.messageBody ?? "",
      };
      pushInMemoryBroadcastAuditEntry(entry);
      return entry;
    },
  };
}
