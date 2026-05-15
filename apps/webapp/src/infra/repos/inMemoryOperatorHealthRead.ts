import type {
  IntegratorPushOutboxHealthSnapshot,
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
  async getIntegratorPushOutboxHealth(): Promise<IntegratorPushOutboxHealthSnapshot> {
    return {
      dueBacklog: 0,
      deadTotal: 0,
      oldestDueAgeSeconds: null,
      dueByKind: {},
      deadByKind: {},
      processingCount: 0,
      oldestProcessingAgeSeconds: null,
      lastQueueActivityAt: null,
    };
  },
};
