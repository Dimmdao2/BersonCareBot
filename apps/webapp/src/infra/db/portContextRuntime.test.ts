import type { Pool, PoolClient, PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import { hashPortTypedArgs, portTypedArg, runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import { createWebappPoolProvider } from './webappPoolProvider';
import { runPgPoolPgText } from './runWebappSql';
import {
  createWebappPortContextRuntimeConfig,
  type PortCapabilityDescriptor,
  type WebappPortContextRuntimeConfig,
  runWithWebappPortOperation,
  webappPortContextPrincipal,
} from './portContextRuntime';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000010';
const CAPABILITY = '00000000-0000-0000-0000-000000000101';

const staffCapability: PortCapabilityDescriptor = {
  capabilityId: CAPABILITY,
  targetRole: 'app_staff',
  contextClass: 'staff',
  purpose: 'relation',
};

function fakePool(log: string[], releases: Error[], cleanupFails = false): Pool {
  const client = {
    async query(sql: string) {
      log.push(sql);
      if (
        cleanupFails &&
        sql === 'SELECT app.clear_port_context()' &&
        log.filter((entry) => entry === sql).length === 2
      ) {
        throw new Error('clear failed');
      }
      return { rows: [{ client }], rowCount: 1 };
    },
    release(error?: Error) {
      if (error) releases.push(error);
    },
  } as unknown as PoolClient;
  return {
    connect: async () => client,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
}

describe('webapp port-context runtime', () => {
  it('rejects a URL whose physical login does not match its declared mTLS login before reading key files', () => {
    expect(() =>
      createWebappPortContextRuntimeConfig({
        DATABASE_URL_STAFF: 'postgresql://wrong@example.test/app',
        DATABASE_URL_PATIENT: 'postgresql://patient@example.test/app',
        WEBAPP_DB_STAFF_LOGIN: 'staff',
        WEBAPP_DB_PATIENT_LOGIN: 'patient',
        WEBAPP_DB_TLS_CA_FILE: '/not-read',
        WEBAPP_DB_STAFF_CERT_FILE: '/not-read',
        WEBAPP_DB_STAFF_KEY_FILE: '/not-read',
        WEBAPP_DB_PATIENT_CERT_FILE: '/not-read',
        WEBAPP_DB_PATIENT_KEY_FILE: '/not-read',
        WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON: '{}',
      }),
    ).toThrow('WEBAPP_STAFF_DATABASE_URL username must equal WEBAPP_STAFF_DB_LOGIN');
  });

  it('selects the staff physical pool and installs the declared role/context on the checked-out client', async () => {
    const log: string[] = [];
    const releases: Error[] = [];
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff@example.test/app', ssl: {} },
        patient: { connectionString: 'postgresql://patient@example.test/app', ssl: {} },
        capabilities: { staff: staffCapability },
      },
      poolFactory: (_config: PoolConfig) => fakePool(log, releases),
    });

    const result = await runWithDbStaffPrincipal(
      { organizationId: ORG, platformUserId: USER },
      () => runPgPoolPgText(pool, 'SELECT exact_client'),
    );

    expect(result.rows[0]).toHaveProperty('client');
    expect(log).toEqual([
      'BEGIN',
      'RESET ROLE',
      'SELECT app.clear_port_context()',
      'SELECT app.install_port_context($1::uuid, ROW(1, $2::app.port_context_class, $3::name, $4::text, $5::regprocedure, $6::bytea, $7::uuid, $8::uuid, $9::uuid, $10::bigint, $11::uuid)::app.port_context_claims)',
      'SET LOCAL ROLE app_staff',
      'SELECT exact_client',
      'RESET ROLE',
      'SELECT app.clear_port_context()',
      'COMMIT',
    ]);
    expect(releases).toHaveLength(0);
  });

  it('destroys the checkout when cleanup fails instead of returning it to either physical pool', async () => {
    const log: string[] = [];
    const releases: Error[] = [];
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff@example.test/app', ssl: {} },
        patient: { connectionString: 'postgresql://patient@example.test/app', ssl: {} },
        capabilities: { staff: staffCapability },
      },
      poolFactory: (_config: PoolConfig) => fakePool(log, releases, true),
    });
    await expect(
      runWithDbStaffPrincipal({ organizationId: ORG, platformUserId: USER }, () =>
        runPgPoolPgText(pool, 'SELECT failure'),
      ),
    ).rejects.toThrow('clear failed');
    expect(log).toContain('ROLLBACK');
    expect(releases).toHaveLength(1);
    expect(releases[0]?.message).toBe('clear failed');
  });

  it('does not retain legacy signed-context installation in the target mapping', () => {
    const selected = webappPortContextPrincipal(
      { kind: 'staff', organizationId: ORG, platformUserId: USER },
      { staff: staffCapability },
    );
    expect(selected).toMatchObject({
      pool: 'staff',
      principal: { capabilityId: CAPABILITY, targetRole: 'app_staff', contextClass: 'staff' },
    });
  });

  it('selects a named capability by exact function and purpose instead of the class default', () => {
    const arg = portTypedArg('uuid', USER);
    const named: PortCapabilityDescriptor = {
      ...staffCapability,
      capabilityId: '00000000-0000-0000-0000-000000000109',
      purpose: 'staff.read_profile',
      functionIdentity: 'app.read_staff_profile(uuid)',
    };
    const selected = runWithWebappPortOperation(
      {
        functionIdentity: named.functionIdentity!,
        typedArgs: [arg],
      },
      () =>
        webappPortContextPrincipal(
          { kind: 'staff', organizationId: ORG, platformUserId: USER },
          { staff: staffCapability, read_profile: named },
        ),
    );
    expect(selected.principal).toMatchObject({
      capabilityId: named.capabilityId,
      functionIdentity: named.functionIdentity,
      typedArgs: [arg],
    });
  });

  it('installs the explicit named descriptor and argument hash before a pool query', async () => {
    const installs: unknown[][] = [];
    const named: PortCapabilityDescriptor = {
      ...staffCapability,
      capabilityId: '00000000-0000-0000-0000-000000000114',
      purpose: 'staff.read_profile',
      functionIdentity: 'app.read_staff_profile(uuid)',
    };
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff/app' },
        patient: { connectionString: 'postgresql://patient/app' },
        capabilities: { staff: staffCapability, named },
      },
      poolFactory: () => {
        const client = {
          query: async (query: string, values?: readonly unknown[]) => {
            if (query.includes('app.install_port_context')) installs.push([...(values ?? [])]);
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
    await runWithDbStaffPrincipal({ organizationId: ORG, platformUserId: USER }, () =>
      runWithWebappPortOperation(
        {
          functionIdentity: named.functionIdentity!,
          typedArgs: [portTypedArg('uuid', USER)],
        },
        () => runPgPoolPgText(pool, 'SELECT app.read_staff_profile($1::uuid)', [USER]),
      ),
    );
    expect(installs).toHaveLength(1);
    expect(installs[0]?.[4]).toBe(named.functionIdentity);
    expect(installs[0]?.[5]).toEqual(hashPortTypedArgs([portTypedArg('uuid', USER)]));
  });

  it('rejects a missing principal before physical checkout', async () => {
    let connects = 0;
    let releases = 0;
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff/app' },
        patient: { connectionString: 'postgresql://patient/app' },
        capabilities: { staff: staffCapability },
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
    await expect(runPgPoolPgText(pool, 'SELECT 1')).rejects.toThrow(
      'A webapp principal is required',
    );
    expect(connects).toBe(0);
    expect(releases).toBe(0);
  });

  it('maps only exact health, general-worker and media-worker sources', () => {
    const descriptor = (
      capabilityId: string,
      targetRole: string,
      runtimeSources: readonly string[],
    ): PortCapabilityDescriptor => ({
      capabilityId,
      targetRole,
      contextClass: 'service',
      purpose: 'relation',
      runtimeSources,
    });
    const capabilities = {
      service: descriptor('00000000-0000-0000-0000-000000000111', 'app_service', [
        'webapp-health-check',
      ]),
      worker: descriptor('00000000-0000-0000-0000-000000000112', 'app_worker', [
        'api/internal/product-analytics/retention:POST',
      ]),
      media_worker: descriptor(
        '00000000-0000-0000-0000-000000000113',
        'app_operational_media_worker',
        [
          'api/internal/media-transcode/enqueue:POST',
          'api/internal/media-worker/control:POST',
        ],
      ),
    };
    expect(
      webappPortContextPrincipal({ kind: 'infra', source: 'webapp-health-check' }, capabilities)
        .principal.targetRole,
    ).toBe('app_service');
    expect(
      webappPortContextPrincipal(
        { kind: 'infra', source: 'api/internal/product-analytics/retention:POST' },
        capabilities,
      ).principal.targetRole,
    ).toBe('app_worker');
    expect(
      webappPortContextPrincipal(
        { kind: 'infra', source: 'api/internal/media-transcode/enqueue:POST' },
        capabilities,
      ).principal.targetRole,
    ).toBe('app_operational_media_worker');
    expect(
      webappPortContextPrincipal(
        { kind: 'infra', source: 'api/internal/media-worker/control:POST' },
        capabilities,
      ).principal.targetRole,
    ).toBe('app_operational_media_worker');
    expect(() =>
      webappPortContextPrincipal(
        { kind: 'infra', source: 'api/internal/product-analytics/retention:POS' },
        capabilities,
      ),
    ).toThrow('Unknown webapp infra source');
    expect(() =>
      webappPortContextPrincipal({ kind: 'infra', source: undefined }, capabilities),
    ).toThrow('<missing>');
  });

  it('authenticates both replacement pools before swapping and keeps the old generation on failure', async () => {
    const created: Array<{ url: string; queries: string[]; endCalls: number }> = [];
    const poolFactory = (config: PoolConfig): Pool => {
      const state = { url: String(config.connectionString), queries: [] as string[], endCalls: 0 };
      created.push(state);
      const pool = {
        on: () => pool,
        removeListener: () => pool,
        connect: async () => ({
          query: async (query: string) => {
            state.queries.push(query);
            if (state.url.includes('rejected') && query === 'SELECT 1')
              throw new Error('certificate rejected');
            return { rows: [{ generation: state.url }], rowCount: 1 };
          },
          release: () => undefined,
        }),
        end: async () => {
          state.endCalls += 1;
        },
      } as unknown as Pool;
      return pool;
    };
    const provider = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://old-staff/app' },
        patient: { connectionString: 'postgresql://old-patient/app' },
        capabilities: { staff: staffCapability },
      },
      poolFactory,
    }) as Pool & { rotatePortContextPools(next: WebappPortContextRuntimeConfig): Promise<void> };
    await expect(
      provider.rotatePortContextPools({
        staff: { connectionString: 'postgresql://rejected-staff/app' },
        patient: { connectionString: 'postgresql://new-patient/app' },
        capabilities: { staff: staffCapability },
      }),
    ).rejects.toThrow('certificate rejected');
    await runWithDbStaffPrincipal({ organizationId: ORG, platformUserId: USER }, () =>
      runPgPoolPgText(provider, 'SELECT after_failed_rotation'),
    );
    expect(created[0]?.queries).toContain('SELECT after_failed_rotation');
    expect(created[0]?.endCalls).toBe(0);
  });

  it('destroys an old checked-out client that prevents certificate-generation drain', async () => {
    const forced: Error[] = [];
    const poolFactory = (config: PoolConfig): Pool => {
      const clients = new Set<object>();
      let finishEnd: (() => void) | undefined;
      let ending = false;
      const maybeFinish = () => {
        if (ending && clients.size === 0) finishEnd?.();
      };
      const pool = {
        on: () => pool,
        removeListener: () => pool,
        connect: async () => {
          const client = {
            query: async () => ({ rows: [], rowCount: 1 }),
            release: (error?: Error) => {
              if (error) forced.push(error);
              clients.delete(client);
              maybeFinish();
            },
          };
          clients.add(client);
          return client;
        },
        end: () => {
          ending = true;
          if (clients.size === 0) return Promise.resolve();
          return new Promise<void>((resolve) => {
            finishEnd = resolve;
          });
        },
      } as unknown as Pool;
      void config;
      return pool;
    };
    const provider = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://old-staff/app' },
        patient: { connectionString: 'postgresql://old-patient/app' },
        capabilities: { staff: staffCapability },
      },
      poolFactory,
    }) as Pool & {
      rotatePortContextPools(next: WebappPortContextRuntimeConfig, timeout?: number): Promise<void>;
    };
    await runWithDbStaffPrincipal({ organizationId: ORG, platformUserId: USER }, () =>
      provider.connect(),
    );
    await provider.rotatePortContextPools(
      {
        staff: { connectionString: 'postgresql://new-staff/app' },
        patient: { connectionString: 'postgresql://new-patient/app' },
        capabilities: { staff: staffCapability },
      },
      2,
    );
    expect(forced.some((error) => /did not drain/.test(error.message))).toBe(true);
  });
});
