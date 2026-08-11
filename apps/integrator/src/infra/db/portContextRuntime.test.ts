import type { Pool, PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import { createIntegratorPoolProvider } from './integratorPoolProvider.js';
import {
  integratorPortContextPrincipal,
  runWithIntegratorPortCapability,
  type IntegratorPortCapabilityDescriptor,
} from './portContextRuntime.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const CAP = '00000000-0000-0000-0000-000000000103';

const request: IntegratorPortCapabilityDescriptor = {
  capabilityId: CAP,
  targetRole: 'app_integrator_request',
  contextClass: 'integrator',
  purpose: 'relation',
};

describe('integrator port-context runtime', () => {
  it('selects request, resolver/service and tenant capabilities from typed principal kind, not a source string', () => {
    expect(
      integratorPortContextPrincipal(
        { kind: 'integrator', integratorUserId: '42', organizationId: ORG, source: 'anything' },
        { request },
      ),
    ).toMatchObject({ targetRole: 'app_integrator_request', contextClass: 'integrator', integratorUserId: '42' });
    const delivery: IntegratorPortCapabilityDescriptor = {
      ...request,
      capabilityId: '00000000-0000-0000-0000-000000000104',
      targetRole: 'app_operational_delivery_worker',
      contextClass: 'service',
    };
    const selected = runWithIntegratorPortCapability('delivery', () =>
      integratorPortContextPrincipal(
        { kind: 'infra', source: 'worker:outgoing-delivery-tick' },
        { request, delivery },
      ),
    );
    expect(selected).toMatchObject({ capabilityId: delivery.capabilityId, targetRole: delivery.targetRole });
  });

  it('creates one physical pool even when request, delivery and scheduler capabilities are declared', () => {
    let pools = 0;
    const fake = {
      on: () => undefined,
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => undefined }),
      end: async () => undefined,
    } as unknown as Pool;
    createIntegratorPoolProvider({
      connectionString: 'postgresql://integrator@example.test/app',
      portContext: {
        pool: { connectionString: 'postgresql://integrator@example.test/app', ssl: {} },
        capabilities: {
          request,
          delivery: { ...request, capabilityId: '00000000-0000-0000-0000-000000000104', targetRole: 'app_operational_delivery_worker', contextClass: 'service' },
          scheduler: { ...request, capabilityId: '00000000-0000-0000-0000-000000000105', targetRole: 'app_operational_scheduler', contextClass: 'service' },
        },
      },
      poolFactory: (_config: PoolConfig) => {
        pools += 1;
        return fake;
      },
    });
    expect(pools).toBe(1);
  });
});
