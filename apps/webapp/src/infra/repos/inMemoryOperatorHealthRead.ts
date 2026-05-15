import type {
  OperatorHealthReadPort,
  OperatorJobStatusTickRow,
  OutgoingDeliveryQueueHealthSnapshot,
} from "@/modules/operator-health/ports";

export const inMemoryOperatorHealthReadPort: OperatorHealthReadPort = {
  async listOpenIncidents() {
    return [];
  },
  async listBackupJobStatus() {
    return [];
  },
  async getOperatorJobStatus(): Promise<OperatorJobStatusTickRow | null> {
    return null;
  },
  async getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot> {
    return {
      dueBacklog: 0,
      deadTotal: 0,
      oldestDueAgeSeconds: null,
      dueByChannel: {},
      dueByKind: {},
      deadByKind: {},
      processingCount: 0,
      lastSentAt: null,
      lastQueueActivityAt: null,
    };
  },
};
