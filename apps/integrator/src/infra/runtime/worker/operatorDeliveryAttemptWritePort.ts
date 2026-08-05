import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbWriteMutation, DbWritePort } from '../../../kernel/contracts/index.js';
import { recordOperatorDeliveryAttempt } from '../../db/repos/operatorDeliveryAttempts.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';
import { isOutgoingDeliveryWorkerAuditContext } from './outgoingDeliveryWorkerAuditContext.js';

const OUTGOING_DELIVERY_WORKER_SOURCE = 'worker:outgoing-delivery-tick';

function shouldRouteDeliveryAttemptToOperatorJournal(): boolean {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind === 'infra' && principal.source === OUTGOING_DELIVERY_WORKER_SOURCE) {
    return true;
  }
  return isOutgoingDeliveryWorkerAuditContext();
}

async function writeOperatorDeliveryAttempt(db: DbPort, mutation: DbWriteMutation): Promise<void> {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind === 'infra' && principal.source === OUTGOING_DELIVERY_WORKER_SOURCE) {
    await recordOperatorDeliveryAttempt(db, mutation);
    return;
  }
  await runWithInfraPrincipal({ source: OUTGOING_DELIVERY_WORKER_SOURCE }, () =>
    recordOperatorDeliveryAttempt(db, mutation),
  );
}

export function createOperatorAwareDeliveryAttemptWritePort(input: {
  db: DbPort;
  tenantWritePort: DbWritePort;
}): DbWritePort {
  return {
    async writeDb(mutation) {
      if (mutation.type === 'delivery.attempt.log' && shouldRouteDeliveryAttemptToOperatorJournal()) {
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
        'Delivery attempt logging requires tenant/integrator or exact delivery-worker principal',
      );
    },
  };
}
