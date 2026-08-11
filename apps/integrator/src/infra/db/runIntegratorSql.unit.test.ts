import { sql } from 'drizzle-orm';
import { hashPortTypedArgs } from '@bersoncare/db-principal';
import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  integratorPortContextPrincipal,
  type IntegratorPortCapabilityDescriptor,
} from './portContextRuntime.js';
import { runIntegratorNamedRoot } from './runIntegratorSql.js';

const QUEUE_ID = '11111111-1111-4111-8111-111111111111';

describe('runIntegratorNamedRoot', () => {
  it('installs the exact named-root transcript before DbPort.query starts', async () => {
    const capabilities: Record<string, IntegratorPortCapabilityDescriptor> = {
      resolve_delivery_scope: {
        capabilityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        targetRole: 'app_operational_integrator_service',
        contextClass: 'service',
        purpose: 'integrator.resolve',
        functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)',
      },
    };
    let selected: ReturnType<typeof integratorPortContextPrincipal> | undefined;
    const db: DbPort = {
      async query<T>() {
        selected = integratorPortContextPrincipal(
          { kind: 'infra', source: 'delivery-handler' },
          capabilities,
        );
        return { rows: [{ resolution: 'operator_global' }] as T[] };
      },
      async tx<T>(fn: (tx: DbPort) => Promise<T>) {
        return fn(this);
      },
    };

    await runIntegratorNamedRoot(
      db,
      'app.resolve_outgoing_delivery_scope(uuid)',
      [QUEUE_ID],
      sql`SELECT app.resolve_outgoing_delivery_scope(${QUEUE_ID}::uuid)`,
    );

    expect(selected).toMatchObject({
      purpose: 'integrator.resolve',
      functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)',
      typedArgs: [{ typeTag: 'uuid@1', value: Buffer.from(QUEUE_ID.replaceAll('-', ''), 'hex') }],
    });
    expect(hashPortTypedArgs(selected?.typedArgs ?? []).toString('hex')).toBe(
      'fe9fe359e5bb08b4500598af5896541c3ab4cb3b8aaa8d0b2076911d07aa8c6e',
    );
  });

  it('rejects an already-open relation transaction before executing the named root', async () => {
    const query = vi.fn();
    const db = {
      query,
      tx: vi.fn(),
      integratorDrizzle: { execute: vi.fn() },
    } as unknown as DbPort;

    await expect(
      runIntegratorNamedRoot(
        db,
        'app.resolve_outgoing_delivery_scope(uuid)',
        [QUEUE_ID],
        sql`SELECT app.resolve_outgoing_delivery_scope(${QUEUE_ID}::uuid)`,
      ),
    ).rejects.toThrow('Integrator named root must start before the relation transaction');
    expect(query).not.toHaveBeenCalled();
  });
});
