import type {
  OperatorHealthReadPort,
  OperatorJobStatusTickRow,
  OutgoingDeliveryQueueHealthSnapshot,
} from '@/modules/operator-health/ports';

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
  async listIntegrationWebhookLastStatus() {
    return [];
  },
  async listWebhookBurstSignals() {
    return [];
  },
  async getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot> {
    return {
      dueBacklog: 0,
      deadTotal: 0,
      deadRecent: 0,
      lastOperatorDeadAt: null,
      blockedRecipientTotal: 0,
      oldestDueAgeSeconds: null,
      dueByChannel: {},
      dueByKind: {},
      deadByKind: {},
      processingCount: 0,
      lastSentAt: null,
      sentByChannel: {},
      lastSentAtByChannel: {},
      confirmedSentLast24h: 0,
      lastQueueActivityAt: null,
    };
  },
  async getTenantIsolationCanarySnapshot() {
    return { organizations: [], truncated: false };
  },
};
