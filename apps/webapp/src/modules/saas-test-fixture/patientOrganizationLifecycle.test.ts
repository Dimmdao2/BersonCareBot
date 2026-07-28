import { describe, expect, it, vi } from 'vitest';
import {
  PatientOrganizationLifecycleError,
  parsePatientOrganizationOperatorDatabaseUrl,
  parsePatientOrganizationLifecycleArgs,
  runPatientOrganizationLifecycle,
  type PatientOrganizationLifecyclePort,
  type PatientOrganizationOperatorProbe,
} from '../../../scripts/patient-organization-test-lifecycle';

function safeProbe(
  overrides: Partial<PatientOrganizationOperatorProbe> = {},
): PatientOrganizationOperatorProbe {
  return {
    urlLoginRole: 'saas_fixture_operator_login',
    databaseName: 'bersoncarebot_test',
    sessionRole: 'saas_fixture_operator_login',
    currentRole: 'saas_fixture_operator_login',
    canLogin: true,
    inherit: true,
    superuser: false,
    createDb: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    appRoleMember: false,
    sanctionedMembershipTopology: true,
    directProductTableAccess: false,
    capabilityExecute: true,
    ...overrides,
  };
}

function portFor(
  probe: PatientOrganizationOperatorProbe = safeProbe(),
): Readonly<{ port: PatientOrganizationLifecyclePort; invoke: ReturnType<typeof vi.fn> }> {
  const invoke = vi.fn(async () => ({ status: 'active' as const, activeRelationships: 2 }));
  return {
    invoke,
    port: {
      readOperatorProbe: vi.fn(async () => probe),
      invoke,
    },
  };
}

describe('patient organization TEST lifecycle arguments', () => {
  it('requires an explicit execute flag for mutations and accepts the pnpm separator', () => {
    expect(parsePatientOrganizationLifecycleArgs(['status'])).toEqual({
      command: 'status',
      execute: false,
    });
    expect(parsePatientOrganizationLifecycleArgs(['--', 'status'])).toEqual({
      command: 'status',
      execute: false,
    });
    expect(parsePatientOrganizationLifecycleArgs(['discharge', '--execute'])).toEqual({
      command: 'discharge',
      execute: true,
    });
    expect(parsePatientOrganizationLifecycleArgs(['restore', '--execute'])).toEqual({
      command: 'restore',
      execute: true,
    });
    for (const argv of [
      [],
      ['unknown'],
      ['discharge'],
      ['restore'],
      ['status', '--execute'],
      ['discharge', '--force'],
      ['restore', '--execute', '--execute'],
    ]) {
      expect(() => parsePatientOrganizationLifecycleArgs(argv)).toThrow(
        PatientOrganizationLifecycleError,
      );
    }
  });
});

describe('patient organization TEST operator URL', () => {
  it('requires a PostgreSQL URI with an explicit safe login', () => {
    expect(
      parsePatientOrganizationOperatorDatabaseUrl(
        'postgresql://u5a_fixture_operator_login@db.test/bersoncarebot_test',
      ),
    ).toEqual({
      connectionString: 'postgresql://u5a_fixture_operator_login@db.test/bersoncarebot_test',
      loginRole: 'u5a_fixture_operator_login',
    });
    for (const value of [
      '',
      'host=db.test dbname=bersoncarebot_test user=u5a_fixture_operator_login',
      'https://u5a_fixture_operator_login@db.test/bersoncarebot_test',
      'postgresql://db.test/bersoncarebot_test',
      'postgresql://unsafe%2Drole@db.test/bersoncarebot_test',
    ]) {
      expect(() => parsePatientOrganizationOperatorDatabaseUrl(value)).toThrow(
        PatientOrganizationLifecycleError,
      );
    }
  });

  it('rejects every URI options spelling before a database connection', () => {
    for (const query of [
      'options=-c%20role%3Dapp_owner',
      'OPTIONS=-c%20role%3Dapp_owner',
      'OpTiOnS=-c%20role%3Dapp_owner',
      '%6fptions=-c%20role%3Dapp_owner',
      '%4f%50%54%49%4f%4e%53=-c%20role%3Dapp_owner',
      'sslmode=disable&options=-c%20role%3Dapp_owner',
    ]) {
      expect(() =>
        parsePatientOrganizationOperatorDatabaseUrl(
          `postgresql://u5a_fixture_operator_login@db.test/bersoncarebot_test?${query}`,
        ),
      ).toThrow(
        expect.objectContaining({
          code: 'operator_database_url_options_forbidden',
        }),
      );
    }
  });
});

describe('patient organization TEST operator boundary', () => {
  it('preflights the sanctioned operator before invoking the closed capability', async () => {
    const events: string[] = [];
    const port: PatientOrganizationLifecyclePort = {
      async readOperatorProbe() {
        events.push('preflight');
        return safeProbe();
      },
      async invoke() {
        events.push('invoke');
        return { status: 'discharged', activeRelationships: 1 };
      },
    };
    await expect(runPatientOrganizationLifecycle(port, 'discharge')).resolves.toEqual({
      status: 'discharged',
      activeRelationships: 1,
    });
    expect(events).toEqual(['preflight', 'invoke']);
  });

  it('rejects unsafe identity, privileges and wrong database before capability invocation', async () => {
    const unsafeProbes: PatientOrganizationOperatorProbe[] = [
      safeProbe({ databaseName: 'bcb_webapp_dev' }),
      safeProbe({ databaseName: 'bcb_webapp_prod' }),
      safeProbe({ urlLoginRole: 'other_operator_login' }),
      safeProbe({ currentRole: 'role_from_uri_options' }),
      safeProbe({ canLogin: false }),
      safeProbe({ inherit: false }),
      safeProbe({ superuser: true }),
      safeProbe({ createDb: true }),
      safeProbe({ createRole: true }),
      safeProbe({ replication: true }),
      safeProbe({ bypassRls: true }),
      safeProbe({ appRoleMember: true }),
      safeProbe({ sanctionedMembershipTopology: false }),
      safeProbe({ directProductTableAccess: true }),
      safeProbe({ capabilityExecute: false }),
    ];
    for (const probe of unsafeProbes) {
      const candidate = portFor(probe);
      await expect(runPatientOrganizationLifecycle(candidate.port, 'status')).rejects.toMatchObject(
        {
          code:
            probe.databaseName === 'bersoncarebot_test'
              ? 'operator_preflight_failed'
              : 'wrong_database',
        },
      );
      expect(candidate.invoke).not.toHaveBeenCalled();
    }
  });

  it('validates exact aggregate postconditions from the capability', async () => {
    for (const result of [
      { status: 'active' as const, activeRelationships: 1 },
      { status: 'discharged' as const, activeRelationships: 2 },
      { status: 'active' as const, activeRelationships: 2 },
    ]) {
      const port: PatientOrganizationLifecyclePort = {
        readOperatorProbe: vi.fn(async () => safeProbe()),
        invoke: vi.fn(async () => result),
      };
      const command = result.status === 'active' ? 'discharge' : 'restore';
      await expect(runPatientOrganizationLifecycle(port, command)).rejects.toMatchObject({
        code: 'lifecycle_postcondition_failed',
      });
    }
  });

  it('accepts idempotent restore and discharge terminal states', async () => {
    await expect(
      runPatientOrganizationLifecycle(
        {
          readOperatorProbe: vi.fn(async () => safeProbe()),
          invoke: vi.fn(async () => ({ status: 'active' as const, activeRelationships: 2 })),
        },
        'restore',
      ),
    ).resolves.toEqual({ status: 'active', activeRelationships: 2 });
    await expect(
      runPatientOrganizationLifecycle(
        {
          readOperatorProbe: vi.fn(async () => safeProbe()),
          invoke: vi.fn(async () => ({ status: 'discharged' as const, activeRelationships: 1 })),
        },
        'discharge',
      ),
    ).resolves.toEqual({ status: 'discharged', activeRelationships: 1 });
  });
});
