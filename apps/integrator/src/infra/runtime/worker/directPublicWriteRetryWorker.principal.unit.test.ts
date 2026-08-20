import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  getCurrentDatabasePrincipal,
} from '../../principal/organizationPrincipal.js';
import {
  integratorPortContextPrincipal,
  type IntegratorPortCapabilityDescriptor,
} from '../../db/portContextRuntime.js';
import { runDirectPublicWriteRetryWorkerTick } from './directPublicWriteRetryWorker.js';

const CAPABILITIES: Record<string, IntegratorPortCapabilityDescriptor> = {
  delivery: {
    capabilityId: '00000000-0000-4000-8000-000000000001',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'relation',
    runtimeSources: [
      'delivery-handler',
      'max-webhook:record-outcome',
      'telegram-webhook:record-outcome',
      'worker:job-queue-drain',
      'worker:outgoing-delivery-tick',
      'worker:projection-outbox-tick',
    ],
  },
};

function dbPortCapturingRuntimeRoles(roles: string[]): DbPort {
  return {
    query: async <T>(): Promise<DbQueryResult<T>> => {
      roles.push(
        integratorPortContextPrincipal(getCurrentDatabasePrincipal(), CAPABILITIES).targetRole,
      );
      return { rows: [] };
    },
    tx: async <T>(fn: (db: DbPort) => Promise<T>): Promise<T> =>
      fn(dbPortCapturingRuntimeRoles(roles)),
  };
}

describe('direct public write retry worker principal', () => {
  it('claims durable retry rows through the delivery-worker capability', async () => {
    const roles: string[] = [];

    await expect(
      runDirectPublicWriteRetryWorkerTick(dbPortCapturingRuntimeRoles(roles)),
    ).resolves.toBe(0);

    expect(roles).toEqual([
      'app_operational_delivery_worker',
      'app_operational_delivery_worker',
    ]);
  });
});
