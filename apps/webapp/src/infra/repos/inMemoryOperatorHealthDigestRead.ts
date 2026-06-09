import type { OperatorHealthDigestReadPort } from "@/modules/operator-health/digestPorts";

export const inMemoryOperatorHealthDigestReadPort: OperatorHealthDigestReadPort = {
  async countAuditErrorsInWindow() {
    return 0;
  },
  async hadOperatorIncidentsResolveAllInWindow() {
    return false;
  },
  async listIncidentsOpenedInWindow() {
    return [];
  },
  async listIncidentsResolvedInWindow() {
    return [];
  },
  async listJobFailuresInWindow() {
    return [];
  },
};
