import type { OperatorHealthReadPort } from "@/modules/operator-health/ports";

export const inMemoryOperatorHealthReadPort: OperatorHealthReadPort = {
  async listOpenIncidents() {
    return [];
  },
  async listPostgresBackupJobStatus() {
    return [];
  },
};
