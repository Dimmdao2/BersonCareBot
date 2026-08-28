import type { OperatorHealthDigestReadPort } from '@/modules/operator-health/digestPorts';

export const inMemoryOperatorHealthDigestReadPort: OperatorHealthDigestReadPort = {
  async readWindow() {
    return {
      auditErrorCount: 0,
      hadResolveAll: false,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
    };
  },
};
