import { describe, expect, it, vi } from 'vitest';
import {
  PatientOrganizationLifecycleError,
  parsePatientOrganizationLifecycleArgs,
  runPatientOrganizationLifecycle,
  type PatientOrganizationLifecycleStatus,
  type PatientOrganizationLifecycleStore,
} from '../../../scripts/patient-organization-test-lifecycle';

type MutableProbe = {
  databaseName: string;
  targetRows: number;
  targetStatus: string | null;
  retainedActiveRows: number;
  sharedPatientRelationshipRows: number;
  sharedPatientActiveRows: number;
};

function storeFor(
  overrides: Partial<MutableProbe> = {},
): Readonly<{
  store: PatientOrganizationLifecycleStore;
  probe: MutableProbe;
  calls: string[];
}> {
  const probe: MutableProbe = {
    databaseName: 'bersoncarebot_test',
    targetRows: 1,
    targetStatus: 'active',
    retainedActiveRows: 1,
    sharedPatientRelationshipRows: 2,
    sharedPatientActiveRows: 2,
    ...overrides,
  };
  const calls: string[] = [];
  const store: PatientOrganizationLifecycleStore = {
    async begin(readOnly) {
      calls.push(`begin:${readOnly ? 'read-only' : 'write'}`);
    },
    async readProbe(lockTarget) {
      calls.push(`probe:${lockTarget ? 'locked' : 'plain'}`);
      return { ...probe };
    },
    async setTargetStatus(status: PatientOrganizationLifecycleStatus) {
      calls.push(`set:${status}`);
      probe.targetStatus = status;
      probe.sharedPatientActiveRows = status === 'active' ? 2 : 1;
      return 1;
    },
    async commit() {
      calls.push('commit');
    },
    async rollback() {
      calls.push('rollback');
    },
  };
  return { store, probe, calls };
}

function errorCode(error: unknown): string {
  expect(error).toBeInstanceOf(PatientOrganizationLifecycleError);
  return (error as PatientOrganizationLifecycleError).code;
}

describe('patient organization TEST lifecycle arguments', () => {
  it('requires an explicit execute flag for mutations and forbids it for status', () => {
    expect(parsePatientOrganizationLifecycleArgs(['status'])).toEqual({
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
    expect(parsePatientOrganizationLifecycleArgs(['--', 'status'])).toEqual({
      command: 'status',
      execute: false,
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
      try {
        parsePatientOrganizationLifecycleArgs(argv);
        throw new Error('expected argument parsing to fail');
      } catch (error) {
        expect(errorCode(error)).toMatch(/usage|explicit_execute_required|status_execute_forbidden/);
      }
    }
  });
});

describe('patient organization TEST lifecycle transaction', () => {
  it('reports status read-only without mutation', async () => {
    const fixture = storeFor();
    await expect(runPatientOrganizationLifecycle(fixture.store, 'status')).resolves.toEqual({
      status: 'active',
      activeRelationships: 2,
    });
    expect(fixture.calls).toEqual(['begin:read-only', 'probe:plain', 'commit']);
  });

  it('discharges and restores only the reserved second relationship', async () => {
    const fixture = storeFor();
    await expect(runPatientOrganizationLifecycle(fixture.store, 'discharge')).resolves.toEqual({
      status: 'discharged',
      activeRelationships: 1,
    });
    expect(fixture.calls).toEqual([
      'begin:write',
      'probe:locked',
      'set:discharged',
      'probe:plain',
      'commit',
    ]);

    fixture.calls.splice(0);
    await expect(runPatientOrganizationLifecycle(fixture.store, 'restore')).resolves.toEqual({
      status: 'active',
      activeRelationships: 2,
    });
    expect(fixture.calls).toEqual([
      'begin:write',
      'probe:locked',
      'set:active',
      'probe:plain',
      'commit',
    ]);
  });

  it('is idempotent in either terminal fixture state', async () => {
    const discharged = storeFor({
      targetStatus: 'discharged',
      sharedPatientActiveRows: 1,
    });
    await runPatientOrganizationLifecycle(discharged.store, 'discharge');
    expect(discharged.calls).not.toContain('set:discharged');

    const active = storeFor();
    await runPatientOrganizationLifecycle(active.store, 'restore');
    expect(active.calls).not.toContain('set:active');
  });

  it('fails closed outside exact TEST and for a non-canonical fixture shape', async () => {
    for (const overrides of [
      { databaseName: 'bcb_webapp_dev' },
      { databaseName: 'bcb_webapp_prod' },
      { targetRows: 0 },
      { targetRows: 2 },
      { targetStatus: 'archived' },
      { targetStatus: 'invited' },
      { retainedActiveRows: 0 },
      { sharedPatientRelationshipRows: 3 },
      { sharedPatientActiveRows: 1 },
    ]) {
      const fixture = storeFor(overrides);
      await expect(runPatientOrganizationLifecycle(fixture.store, 'status')).rejects.toBeInstanceOf(
        PatientOrganizationLifecycleError,
      );
      expect(fixture.calls).toContain('rollback');
      expect(fixture.calls).not.toContain('commit');
    }
  });

  it('rolls back when the exact-row update does not converge', async () => {
    const fixture = storeFor();
    const brokenStore: PatientOrganizationLifecycleStore = {
      ...fixture.store,
      setTargetStatus: vi.fn(async () => 0),
    };
    await expect(runPatientOrganizationLifecycle(brokenStore, 'discharge')).rejects.toMatchObject({
      code: 'reserved_target_update_mismatch',
    });
    expect(fixture.calls).toContain('rollback');
    expect(fixture.calls).not.toContain('commit');
  });
});
