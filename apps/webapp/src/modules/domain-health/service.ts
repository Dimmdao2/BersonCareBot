import type { DomainHealthCandidatePort, DomainHealthTarget } from '@/modules/domain-health/ports';

export function createDomainHealthService(port: DomainHealthCandidatePort) {
  return {
    async listConfiguredTargets(): Promise<DomainHealthTarget[]> {
      return port.listConfiguredTargets();
    },
  };
}

export type DomainHealthService = ReturnType<typeof createDomainHealthService>;
