import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  getCurrentDatabasePrincipal,
} from '../../principal/organizationPrincipal.js';
import {
  integratorPortContextPrincipal,
  type IntegratorPortCapabilityDescriptor,
} from '../../db/portContextRuntime.js';
import { logger } from '../../observability/logger.js';
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

  it('dead-letters an organization mismatch immediately and logs both organizations', async () => {
    const retryOrganizationId = 'a0000000-0000-4000-8000-000000000001';
    const payloadOrganizationId = 'a0000000-0000-4000-8000-000000000002';
    const queries: Array<{ text: string; params?: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params?: unknown[]): Promise<DbQueryResult<T>> {
        queries.push(params === undefined ? { text } : { text, params });
        if (text.includes('RETURNING retry.id, retry.operation, retry.organization_id')) {
          return {
            rows: [
              {
                id: 91,
                operation: 'reminder_occurrence_sent_record',
                organization_id: retryOrganizationId,
                idempotency_key: 'direct-public-write:foreign-91',
                payload: { organizationId: payloadOrganizationId },
                attempt_count: 1,
                max_attempts: 5,
              } as T,
            ],
          };
        }
        return { rows: [] };
      },
      async tx<T>(fn: (txDb: DbPort) => Promise<T>): Promise<T> {
        return fn(this);
      },
    };
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(runDirectPublicWriteRetryWorkerTick(db)).resolves.toBe(1);

    expect(queries.some(({ text }) => text.includes("SET status = 'dead'"))).toBe(true);
    expect(queries.some(({ text }) => text.includes('next_try_at = now() +'))).toBe(false);
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        retryId: 91,
        retryOrganizationId,
        payloadOrganizationId,
      }),
      'direct public write retry rejected organization mismatch',
    );
    errorLog.mockRestore();
  });
});
