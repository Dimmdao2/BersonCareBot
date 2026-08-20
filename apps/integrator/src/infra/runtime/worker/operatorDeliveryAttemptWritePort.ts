import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbWritePort } from '../../../kernel/contracts/index.js';
import { writeOperatorDeliveryAttempt } from '../../db/repos/operatorDeliveryAttempts.js';

export function createOperatorAwareDeliveryAttemptWritePort(input: {
  db: DbPort;
  tenantWritePort: DbWritePort;
}): DbWritePort {
  return {
    async writeDb(mutation) {
      if (mutation.type === 'delivery.attempt.log') {
        await writeOperatorDeliveryAttempt(input.db, mutation);
        return;
      }
      const principal = getCurrentDbPrincipal();
      if (
        principal?.kind === 'organization' ||
        principal?.kind === 'staff' ||
        principal?.kind === 'patient' ||
        principal?.kind === 'integrator'
      ) {
        return await input.tenantWritePort.writeDb(mutation);
      }
      if (principal?.kind === 'infra') {
        return await input.tenantWritePort.writeDb(mutation);
      }
      throw new Error(
        'Write mutation requires tenant, integrator, or infrastructure principal',
      );
    },
  };
}
