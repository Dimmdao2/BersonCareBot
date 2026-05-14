import type { OperatorHealthReadPort, OutgoingDeliveryQueueHealthSnapshot } from "@/modules/operator-health/ports";

export const inMemoryOperatorHealthReadPort: OperatorHealthReadPort = {
  async listOpenIncidents() {
    return [];
  },
  async listBackupJobStatus() {
    return [];
  },
  async getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot> {
    return { dueBacklog: 0, deadTotal: 0, oldestDueAgeSeconds: null };
  },
};
