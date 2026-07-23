import { describe, expect, it, vi } from 'vitest';
import {
  PatientOrganizationLifecycleError,
  parsePatientOrganizationLifecycleArgs,
  runPatientOrganizationLifecycle,
  type PatientOrganizationLifecyclePort,
  type PatientOrganizationOperatorProbe,
} from '../../../scripts/patient-organization-test-lifecycle';

function safeProbe(
  overrides: Partial<PatientOrganizationOperatorProbe> = {},
): PatientOrganizationOperatorProbe {
  return {
    databaseName: 'bersoncarebot_test',
    loginRole: 'saas_fixture_operator_login',
    canLogin: true,
    inherit: true,
    superuser: false,
    createDb: false,
    createRole: false,
    replication: false,
    bypassRls: false,
    appRoleMember: false,
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
      safeProbe({ canLogin: false }),
      safeProbe({ inherit: false }),
      safeProbe({ superuser: true }),
      safeProbe({ createDb: true }),
      safeProbe({ createRole: true }),
      safeProbe({ replication: true }),
      safeProbe({ bypassRls: true }),
      safeProbe({ appRoleMember: true }),
      safeProbe({ directProductTableAccess: true }),
      safeProbe({ capabilityExecute: false }),
    ];
    for (const probe of unsafeProbes) {
      const candidate = portFor(probe);
      await expect(runPatientOrganizationLifecycle(candidate.port, 'status')).rejects.toMatchObject({
        code: probe.databaseName === 'bersoncarebot_test' ? 'operator_preflight_failed' : 'wrong_database',
      });
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
