import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbWritePort } from '../../../kernel/contracts/index.js';
import { recordOperatorDeliveryAttempt } from '../../db/repos/operatorDeliveryAttempts.js';

export function createOperatorAwareDeliveryAttemptWritePort(input: {
  db: DbPort;
  tenantWritePort: DbWritePort;
}): DbWritePort {
  return {
    async writeDb(mutation) {
      const principal = getCurrentDbPrincipal();
      if (principal?.kind === 'infra' && principal.source === 'worker:outgoing-delivery-tick') {
        await recordOperatorDeliveryAttempt(input.db, mutation);
        return;
      }
      if (
        principal?.kind === 'organization'
        || principal?.kind === 'staff'
        || principal?.kind === 'patient'
        || principal?.kind === 'integrator'
      ) {
        return await input.tenantWritePort.writeDb(mutation);
      }
      throw new Error('Delivery attempt logging requires tenant/integrator or exact delivery-worker principal');
    },
  };
}
