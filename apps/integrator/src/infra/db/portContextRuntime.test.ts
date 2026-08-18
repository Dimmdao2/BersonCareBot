import type { Pool, PoolClient, PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import { hashPortTypedArgs, portTypedArg, runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../../kernel/contracts/index.js';
import { createIntegratorPoolProvider } from './integratorPoolProvider.js';
import { runIntegratorSql } from './runIntegratorSql.js';
import { sql } from 'drizzle-orm';
import {
  integratorPortContextPrincipal,
  integratorPortCapabilityForInfraSource,
  runWithIntegratorPortCapability,
  runWithIntegratorPortOperation,
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
    ).toMatchObject({
      targetRole: 'app_integrator_request',
      contextClass: 'integrator',
      integratorUserId: '42',
    });
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
    expect(selected).toMatchObject({
      capabilityId: delivery.capabilityId,
      targetRole: delivery.targetRole,
    });
    const resolver: IntegratorPortCapabilityDescriptor = {
      ...request,
      capabilityId: '00000000-0000-0000-0000-000000000120',
      targetRole: 'app_integrator_resolver',
      contextClass: 'integrator',
    };
    expect(
      integratorPortContextPrincipal(
        { kind: 'bootstrap', source: 'telegram-webhook:pre-routing' },
        { request, resolver },
      ),
    ).toMatchObject({ targetRole: 'app_integrator_resolver', contextClass: 'integrator' });
  });

  it('creates one physical pool even when request, delivery and scheduler capabilities are declared', () => {
    let pools = 0;
    const fake = {
      on: () => undefined,
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => undefined,
      }),
      end: async () => undefined,
    } as unknown as Pool;
    createIntegratorPoolProvider({
      connectionString: 'postgresql://integrator@example.test/app',
      portContext: {
        pool: { connectionString: 'postgresql://integrator@example.test/app', ssl: {} },
        capabilities: {
          request,
          delivery: {
            ...request,
            capabilityId: '00000000-0000-0000-0000-000000000104',
            targetRole: 'app_operational_delivery_worker',
            contextClass: 'service',
          },
          scheduler: {
            ...request,
            capabilityId: '00000000-0000-0000-0000-000000000105',
            targetRole: 'app_operational_scheduler',
            contextClass: 'service',
          },
        },
      },
      poolFactory: (_config: PoolConfig) => {
        pools += 1;
        return fake;
      },
    });
    expect(pools).toBe(1);
  });

  it('switches an organization nested inside a delivery scope to the tenant-service capability', () => {
    const delivery: IntegratorPortCapabilityDescriptor = {
      ...request,
      capabilityId: '00000000-0000-0000-0000-000000000104',
      targetRole: 'app_operational_delivery_worker',
      contextClass: 'service',
    };
    const selected = runWithIntegratorPortCapability('delivery', () =>
      integratorPortContextPrincipal(
        { kind: 'organization', organizationId: ORG },
        {
          request,
          delivery,
          tenant_service: {
            ...request,
            capabilityId: '00000000-0000-0000-0000-000000000105',
            targetRole: 'app_tenant_service',
            contextClass: 'tenant_service',
          },
        },
      ),
    );
    expect(selected).toMatchObject({
      contextClass: 'tenant_service',
      targetRole: 'app_tenant_service',
      organizationId: ORG,
    });
  });

  it('selects a named capability by exact function and purpose and carries canonical typed args', () => {
    const named = {
      ...request,
      contextClass: 'service' as const,
      functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)',
      purpose: 'delivery.resolve_scope',
    };
    const arg = portTypedArg('uuid', ORG);
    const selected = runWithIntegratorPortOperation(
      {
        functionIdentity: named.functionIdentity,
        typedArgs: [arg],
      },
      () =>
        integratorPortContextPrincipal(
          { kind: 'infra', source: 'worker:outgoing-delivery-tick' },
          { exact_scope: named },
        ),
    );
    expect(selected).toMatchObject({
      functionIdentity: named.functionIdentity,
      purpose: named.purpose,
      typedArgs: [arg],
    });
  });

  it('allows a bootstrap principal to invoke only an exact resolver named root', () => {
    const named: IntegratorPortCapabilityDescriptor = {
      ...request,
      targetRole: 'app_integrator_resolver',
      functionIdentity: 'app.resolve_clinic_dedicated_bot_organization(text,text)',
      purpose: 'integrator.dedicated-bot.resolve',
    };
    const selected = runWithIntegratorPortOperation(
      {
        functionIdentity: named.functionIdentity!,
        typedArgs: [portTypedArg('text', 'telegram'), portTypedArg('text', 'a'.repeat(64))],
      },
      () =>
        integratorPortContextPrincipal(
          { kind: 'bootstrap', source: 'telegram-dedicated-webhook:pre-routing' },
          { dedicated_bot_organization_resolve: named },
        ),
    );
    expect(selected).toMatchObject({
      targetRole: 'app_integrator_resolver',
      contextClass: 'integrator',
      functionIdentity: named.functionIdentity,
    });
  });

  it('installs the explicit named descriptor and argument hash before a connect-client query', async () => {
    const installs: unknown[][] = [];
    const service: IntegratorPortCapabilityDescriptor = {
      ...request,
      contextClass: 'service',
      targetRole: 'app_service',
      runtimeSources: ['integrator-health-check'],
    };
    const named: IntegratorPortCapabilityDescriptor = {
      ...service,
      capabilityId: '00000000-0000-0000-0000-000000000119',
      functionIdentity: 'app.resolve_outgoing_delivery_scope(uuid)',
      purpose: 'delivery.resolve_scope',
    };
    const provider = createIntegratorPoolProvider({
      connectionString: 'postgresql://integrator/app',
      portContext: {
        pool: { connectionString: 'postgresql://integrator/app' },
        capabilities: { service, named },
      },
      poolFactory: () => {
        const client = {
          query: async (query: string, values?: readonly unknown[]) => {
            if (query.includes('app.begin_port_context')) installs.push([...(values ?? [])]);
            return { rows: [], rowCount: 0 };
          },
          release: () => undefined,
        } as unknown as PoolClient;
        return {
          connect: async () => client,
          on: () => undefined,
          end: async () => undefined,
        } as unknown as Pool;
      },
    });
    await runWithDbInfraPrincipal({ source: 'integrator-health-check' }, () =>
      runWithIntegratorPortOperation(
        {
          functionIdentity: named.functionIdentity!,
          typedArgs: [portTypedArg('uuid', ORG)],
        },
        () =>
          runIntegratorSql(
            provider as unknown as DbPort,
            sql`SELECT app.resolve_outgoing_delivery_scope(${ORG}::uuid)`,
          ),
      ),
    );
    expect(installs).toHaveLength(1);
    expect(installs[0]?.[4]).toBe(named.functionIdentity);
    expect(installs[0]?.[5]).toEqual(hashPortTypedArgs([portTypedArg('uuid', ORG)]));
  });

  it('rejects a missing principal before physical checkout', async () => {
    let connects = 0;
    let releases = 0;
    const provider = createIntegratorPoolProvider({
      connectionString: 'postgresql://integrator/app',
      portContext: {
        pool: { connectionString: 'postgresql://integrator/app' },
        capabilities: { request },
      },
      poolFactory: () =>
        ({
          connect: async () => {
            connects += 1;
            return {
              query: async () => ({ rows: [], rowCount: 0 }),
              release: () => {
                releases += 1;
              },
            };
          },
          on: () => undefined,
          end: async () => undefined,
        }) as unknown as Pool,
    });
    await expect(
      runIntegratorSql(provider as unknown as DbPort, sql`SELECT ${1}::integer`),
    ).rejects.toThrow('An integrator principal is required');
    expect(connects).toBe(0);
    expect(releases).toBe(0);
  });

  it('maps only exact scheduler, delivery, service and migration-ledger sources', () => {
    const capabilities = {
      scheduler: { ...request, contextClass: 'service' as const, runtimeSources: ['scheduler:claim-due-jobs'] },
      delivery: { ...request, contextClass: 'service' as const, runtimeSources: ['worker:outgoing-delivery-tick'] },
      service: { ...request, contextClass: 'service' as const, runtimeSources: ['integrator-health-check'] },
      migration_ledger: { ...request, contextClass: 'service' as const,
        runtimeSources: ['integrator-startup-migration-ledger'] },
    };
    expect(integratorPortCapabilityForInfraSource('scheduler:claim-due-jobs', capabilities)).toBe('scheduler');
    expect(integratorPortCapabilityForInfraSource('worker:outgoing-delivery-tick', capabilities)).toBe(
      'delivery',
    );
    expect(integratorPortCapabilityForInfraSource('integrator-health-check', capabilities)).toBe('service');
    expect(integratorPortCapabilityForInfraSource('integrator-startup-migration-ledger', capabilities)).toBe(
      'migration_ledger',
    );
    expect(() => integratorPortCapabilityForInfraSource('scheduler:claim-due-job', capabilities)).toThrow(
      'Unknown integrator infra source',
    );
    expect(() => integratorPortCapabilityForInfraSource(undefined, capabilities)).toThrow('<missing>');
  });

  it('preflights replacement authentication before swap and forwards pool error listeners after rotation', async () => {
    const generations: Array<{
      url: string;
      listeners: Set<(error: Error) => void>;
      endCalls: number;
    }> = [];
    const poolFactory = (config: PoolConfig): Pool => {
      const state = {
        url: String(config.connectionString),
        listeners: new Set<(error: Error) => void>(),
        endCalls: 0,
      };
      generations.push(state);
      const pool = {
        on: (event: string, listener: (error: Error) => void) => {
          if (event === 'error') state.listeners.add(listener);
          return pool;
        },
        removeListener: (event: string, listener: (error: Error) => void) => {
          if (event === 'error') state.listeners.delete(listener);
          return pool;
        },
        connect: async () => ({
          generation: state.url,
          query: async (query: string) => {
            if (state.url.includes('rejected') && query === 'SELECT 1')
              throw new Error('new credential rejected');
            return { rows: [], rowCount: 1 };
          },
          release: () => undefined,
        }),
        end: async () => {
          state.endCalls += 1;
        },
      } as unknown as Pool;
      return pool;
    };
    const provider = createIntegratorPoolProvider({
      connectionString: 'postgresql://old/app',
      portContext: {
        pool: { connectionString: 'postgresql://old/app' },
        capabilities: { request },
      },
      poolFactory,
    }) as Pool & {
      rotatePortContextPool(next: {
        pool: PoolConfig;
        capabilities: Record<string, IntegratorPortCapabilityDescriptor>;
      }): Promise<void>;
    };
    let observed: Error | undefined;
    provider.on('error', (error) => {
      observed = error;
    });
    await expect(
      provider.rotatePortContextPool({
        pool: { connectionString: 'postgresql://rejected/app' },
        capabilities: { request },
      }),
    ).rejects.toThrow('new credential rejected');
    const stillOld = (await provider.connect()) as PoolClient & { generation: string };
    expect(stillOld.generation).toContain('old');
    stillOld.release();
    expect(generations[0]?.endCalls).toBe(0);

    await provider.rotatePortContextPool({
      pool: { connectionString: 'postgresql://new/app' },
      capabilities: { request },
    });
    const emitted = new Error('replacement idle client failed');
    for (const listener of generations[2]!.listeners) listener(emitted);
    expect(observed).toBe(emitted);
  });
});
