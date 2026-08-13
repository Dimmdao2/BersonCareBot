import type { Pool, PoolClient, PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  hashPortTypedArgs,
  portTypedArg,
  runWithDbPatientPrincipal,
  runWithDbPlatformPrincipal,
  runWithDbStaffPrincipal,
} from '@bersoncare/db-principal';
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
const OPAQUE_USER = '10000000-0000-4000-8000-000000000010';
const CAPABILITY = '00000000-0000-0000-0000-000000000101';

const staffCapability: PortCapabilityDescriptor = {
  capabilityId: CAPABILITY,
  targetRole: 'app_staff',
  contextClass: 'staff',
  purpose: 'relation',
};
const staffIdentityCapability: PortCapabilityDescriptor = {
  capabilityId: '00000000-0000-0000-0000-000000000102',
  targetRole: 'app_pre_session',
  contextClass: 'pre_session',
  purpose: 'identity.variant-a.resolve',
  functionIdentity: 'app.pre_session_resolve_identity(uuid)',
};
const staffCapabilities = {
  staff: staffCapability,
  staff_identity_resolve: staffIdentityCapability,
};
const patientIdentityCapability: PortCapabilityDescriptor = {
  ...staffIdentityCapability,
  capabilityId: '00000000-0000-0000-0000-000000000120',
};
const patientOrganizationResolveCapability: PortCapabilityDescriptor = {
  capabilityId: '00000000-0000-0000-0000-000000000121',
  targetRole: 'app_patient',
  contextClass: 'patient',
  purpose: 'patient.organization.resolve',
  functionIdentity: 'app.read_current_patient_active_organizations()',
};

type FakeQueryInput = string | { text: string; values?: readonly unknown[] };

function normalizeFakeQuery(
  input: FakeQueryInput,
  values?: readonly unknown[],
): { text: string; values: readonly unknown[] } {
  return typeof input === 'string'
    ? { text: input, values: values ?? [] }
    : { text: input.text, values: input.values ?? [] };
}

function fakePool(log: string[], releases: Error[], cleanupFails = false): Pool {
  let released = false;
  const client = {
    async query(input: FakeQueryInput, values?: readonly unknown[]) {
      const { text } = normalizeFakeQuery(input, values);
      log.push(text);
      if (
        cleanupFails &&
        text === 'SELECT app.clear_port_context()' &&
        log.filter((entry) => entry === text).length === 2
      ) {
        throw new Error('clear failed');
      }
      if (text.startsWith('SELECT app.pre_session_resolve_identity')) {
        return { rows: [{ opaque_ref: OPAQUE_USER }], rowCount: 1 };
      }
      return { rows: [{ client }], rowCount: 1 };
    },
    release(error?: Error) {
      if (released) throw new Error('Release called on client which has already been released');
      released = true;
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
        DATABASE_URL_GLOBAL_ADMIN: 'postgresql://global-admin@example.test/app',
        WEBAPP_DB_STAFF_LOGIN: 'staff',
        WEBAPP_DB_PATIENT_LOGIN: 'patient',
        WEBAPP_DB_GLOBAL_ADMIN_LOGIN: 'global-admin',
        WEBAPP_DB_TLS_CA_FILE: '/not-read',
        WEBAPP_DB_STAFF_CERT_FILE: '/not-read',
        WEBAPP_DB_STAFF_KEY_FILE: '/not-read',
        WEBAPP_DB_PATIENT_CERT_FILE: '/not-read',
        WEBAPP_DB_PATIENT_KEY_FILE: '/not-read',
        WEBAPP_DB_GLOBAL_ADMIN_CERT_FILE: '/not-read',
        WEBAPP_DB_GLOBAL_ADMIN_KEY_FILE: '/not-read',
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
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
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
      'SET LOCAL ROLE app_pre_session',
      'SELECT app.pre_session_resolve_identity($1::uuid) AS opaque_ref',
      'RESET ROLE',
      'SELECT app.clear_port_context()',
      'COMMIT',
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
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
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
      OPAQUE_USER,
    );
    expect(selected).toMatchObject({
      pool: 'staff',
      principal: { capabilityId: CAPABILITY, targetRole: 'app_staff', contextClass: 'staff' },
    });
  });

  it('routes an authenticated platform principal only through the global-admin pool', async () => {
    const selectedUrls: string[] = [];
    const platformCapabilities: Record<string, PortCapabilityDescriptor> = {
      globalAdmin_identity_resolve: {
        ...staffIdentityCapability,
        capabilityId: '00000000-0000-0000-0000-000000000118',
      },
      platform: {
        capabilityId: '00000000-0000-0000-0000-000000000119',
        targetRole: 'app_platform_settings',
        contextClass: 'platform',
        purpose: 'relation',
      },
    };
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff/app' },
        patient: { connectionString: 'postgresql://patient/app' },
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: platformCapabilities,
      },
      poolFactory: (config) => {
        const inner = fakePool([], []);
        return {
          ...inner,
          connect: async () => {
            selectedUrls.push(String(config.connectionString));
            return inner.connect();
          },
        } as Pool;
      },
    });

    await runWithDbPlatformPrincipal({ platformUserId: USER }, () =>
      runPgPoolPgText(pool, 'SELECT platform_settings'),
    );

    expect(selectedUrls).toEqual(['postgresql://global-admin/app']);
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
          OPAQUE_USER,
        ),
    );
    expect(selected.principal).toMatchObject({
      capabilityId: named.capabilityId,
      functionIdentity: named.functionIdentity,
      typedArgs: [arg],
    });
  });

  it('allows only the exact patient organization resolver before organization selection', () => {
    const selected = runWithWebappPortOperation(
      {
        functionIdentity: patientOrganizationResolveCapability.functionIdentity!,
        typedArgs: [],
      },
      () =>
        webappPortContextPrincipal(
          { kind: 'patient', platformUserId: USER },
          { patient_active_organizations_resolve: patientOrganizationResolveCapability },
          OPAQUE_USER,
        ),
    );
    expect(selected).toMatchObject({
      pool: 'patient',
      principal: {
        targetRole: 'app_patient',
        functionIdentity: 'app.read_current_patient_active_organizations()',
        actorRef: OPAQUE_USER,
        subjectRef: OPAQUE_USER,
      },
    });
    expect(selected.principal).not.toHaveProperty('organizationId');
    expect(() =>
      webappPortContextPrincipal(
        { kind: 'patient', platformUserId: USER },
        {
          patient: {
            ...patientOrganizationResolveCapability,
            purpose: 'relation',
            functionIdentity: undefined,
          },
        },
        OPAQUE_USER,
      ),
    ).toThrow('organization-scoped patient principal');
  });

  it('destroys a checkout when patient principal projection rejects before transaction start', async () => {
    const log: string[] = [];
    const releases: Error[] = [];
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff/app' },
        patient: { connectionString: 'postgresql://patient/app' },
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: {
          patient_identity_resolve: patientIdentityCapability,
          patient: {
            capabilityId: '00000000-0000-0000-0000-000000000122',
            targetRole: 'app_patient',
            contextClass: 'patient',
            purpose: 'relation',
          },
        },
      },
      poolFactory: () => fakePool(log, releases),
    });
    await expect(
      runWithDbPatientPrincipal({ platformUserId: USER }, () =>
        runPgPoolPgText(pool, 'SELECT must_not_run'),
      ),
    ).rejects.toThrow('organization-scoped patient principal');
    expect(log).not.toContain('SELECT must_not_run');
    expect(releases).toHaveLength(1);
    expect(releases[0]?.message).toContain('organization-scoped patient principal');
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
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: { ...staffCapabilities, named },
      },
      poolFactory: () => {
        const client = {
          query: async (input: FakeQueryInput, values?: readonly unknown[]) => {
            const query = normalizeFakeQuery(input, values);
            if (query.text.includes('app.install_port_context')) installs.push([...query.values]);
            if (query.text.startsWith('SELECT app.pre_session_resolve_identity')) {
              return { rows: [{ opaque_ref: OPAQUE_USER }], rowCount: 1 };
            }
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
    expect(installs).toHaveLength(2);
    expect(installs[0]?.[4]).toBe(staffIdentityCapability.functionIdentity);
    expect(installs[1]?.[4]).toBe(named.functionIdentity);
    expect(installs[1]?.[5]).toEqual(hashPortTypedArgs([portTypedArg('uuid', USER)]));
  });

  it('rejects a missing principal before physical checkout', async () => {
    let connects = 0;
    let releases = 0;
    const pool = createWebappPoolProvider({
      portContext: {
        staff: { connectionString: 'postgresql://staff/app' },
        patient: { connectionString: 'postgresql://patient/app' },
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
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

  it('maps health to worker and keeps telemetry/media on their exact reachable roles', () => {
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
      worker: descriptor('00000000-0000-0000-0000-000000000112', 'app_worker', [
        'webapp-health-check',
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
      telemetry: descriptor(
        '00000000-0000-0000-0000-000000000115',
        'saas_telemetry_operator',
        ['webapp-saas-isolation-telemetry'],
      ),
    };
    expect(
      webappPortContextPrincipal({ kind: 'infra', source: 'webapp-health-check' }, capabilities)
        .principal.targetRole,
    ).toBe('app_worker');
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
        { kind: 'infra', source: 'webapp-saas-isolation-telemetry' },
        capabilities,
      ).principal.targetRole,
    ).toBe('saas_telemetry_operator');
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

  it('maps a named bootstrap root to app_pre_session on the patient pool', () => {
    const preSession: PortCapabilityDescriptor = {
      capabilityId: '00000000-0000-0000-0000-000000000116',
      targetRole: 'app_pre_session',
      contextClass: 'pre_session',
      purpose: 'config.runtime.public.read',
      functionIdentity: 'app.read_public_runtime_setting(text,text)',
    };
    expect(
      runWithWebappPortOperation(
        { functionIdentity: preSession.functionIdentity!, typedArgs: [] },
        () => webappPortContextPrincipal(
          { kind: 'bootstrap', source: 'webapp-public-runtime-config' },
          { read_public_runtime_setting: preSession },
        ),
      ),
    ).toMatchObject({ pool: 'patient', principal: { targetRole: 'app_pre_session' } });
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
          query: async (input: FakeQueryInput, values?: readonly unknown[]) => {
            const { text } = normalizeFakeQuery(input, values);
            state.queries.push(text);
            if (state.url.includes('rejected') && text === 'SELECT 1')
              throw new Error('certificate rejected');
            if (text.startsWith('SELECT app.pre_session_resolve_identity')) {
              return { rows: [{ opaque_ref: OPAQUE_USER }], rowCount: 1 };
            }
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
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
      },
      poolFactory,
    }) as Pool & { rotatePortContextPools(next: WebappPortContextRuntimeConfig): Promise<void> };
    await expect(
      provider.rotatePortContextPools({
        staff: { connectionString: 'postgresql://rejected-staff/app' },
        patient: { connectionString: 'postgresql://new-patient/app' },
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
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
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
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
        globalAdmin: { connectionString: 'postgresql://global-admin/app' },
        capabilities: staffCapabilities,
      },
      2,
    );
    expect(forced.some((error) => /did not drain/.test(error.message))).toBe(true);
  });
});
