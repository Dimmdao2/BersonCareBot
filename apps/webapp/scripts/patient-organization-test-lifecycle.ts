#!/usr/bin/env tsx
/**
 * Reversible lifecycle control for the canonical shared-patient TEST fixture.
 *
 * This is an operator-only fixture tool, not a product enrollment writer. It can touch only the
 * reserved Clinic B relationship of the reserved shared patient in exact `bersoncarebot_test`.
 */
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { SAAS_TEST_FIXTURE_OPERATOR_REFS } from './seed-saas-test-walkthrough-fixtures';

const REQUIRED_DATABASE = 'bersoncarebot_test';
const TARGET = Object.freeze({
  enrollmentId:
    SAAS_TEST_FIXTURE_OPERATOR_REFS.contexts.clinicB.sharedPatientEnrollmentId,
  organizationId: SAAS_TEST_FIXTURE_OPERATOR_REFS.contexts.clinicB.organizationId,
  platformUserId: SAAS_TEST_FIXTURE_OPERATOR_REFS.contexts.sharedPatient.platformUserId,
  retainedEnrollmentId:
    SAAS_TEST_FIXTURE_OPERATOR_REFS.contexts.clinicA.sharedPatientEnrollmentId,
  retainedOrganizationId: SAAS_TEST_FIXTURE_OPERATOR_REFS.contexts.clinicA.organizationId,
});

export type PatientOrganizationLifecycleStatus = 'active' | 'discharged';
export type PatientOrganizationLifecycleCommand = 'status' | 'discharge' | 'restore';

type LifecycleProbe = Readonly<{
  databaseName: string;
  targetRows: number;
  targetStatus: string | null;
  retainedActiveRows: number;
  sharedPatientRelationshipRows: number;
  sharedPatientActiveRows: number;
}>;

export type PatientOrganizationLifecycleStore = Readonly<{
  begin(readOnly: boolean): Promise<void>;
  readProbe(lockTarget: boolean): Promise<LifecycleProbe>;
  setTargetStatus(status: PatientOrganizationLifecycleStatus): Promise<number>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}>;

export class PatientOrganizationLifecycleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'PatientOrganizationLifecycleError';
    this.code = code;
  }
}

function fail(code: string): never {
  throw new PatientOrganizationLifecycleError(code);
}

export function parsePatientOrganizationLifecycleArgs(
  argv: readonly string[],
): Readonly<{ command: PatientOrganizationLifecycleCommand; execute: boolean }> {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const command = normalizedArgv[0];
  const trailing = normalizedArgv.slice(1);
  if (command !== 'status' && command !== 'discharge' && command !== 'restore') {
    fail('usage');
  }
  if (trailing.some((arg) => arg !== '--execute') || trailing.length > 1) fail('usage');
  const execute = trailing[0] === '--execute';
  if (command === 'status' && execute) fail('status_execute_forbidden');
  if (command !== 'status' && !execute) fail('explicit_execute_required');
  return { command, execute };
}

function assertCanonicalProbe(probe: LifecycleProbe): void {
  if (probe.databaseName !== REQUIRED_DATABASE) fail('wrong_database');
  if (probe.targetRows !== 1) fail('reserved_target_missing_or_ambiguous');
  if (probe.sharedPatientRelationshipRows !== 2) fail('shared_patient_fixture_shape_mismatch');
  if (probe.retainedActiveRows !== 1) fail('retained_relationship_not_active');
  if (probe.targetStatus !== 'active' && probe.targetStatus !== 'discharged') {
    fail('reserved_target_unexpected_status');
  }
}

function desiredStatus(
  command: PatientOrganizationLifecycleCommand,
  current: PatientOrganizationLifecycleStatus,
): PatientOrganizationLifecycleStatus {
  if (command === 'status') return current;
  return command === 'discharge' ? 'discharged' : 'active';
}

function assertPostcondition(
  command: PatientOrganizationLifecycleCommand,
  probe: LifecycleProbe,
): void {
  assertCanonicalProbe(probe);
  const expectedStatus = command === 'discharge' ? 'discharged' : 'active';
  if (command !== 'status' && probe.targetStatus !== expectedStatus) {
    fail('lifecycle_postcondition_failed');
  }
  const expectedActiveRelationships = probe.targetStatus === 'active' ? 2 : 1;
  if (probe.sharedPatientActiveRows !== expectedActiveRelationships) {
    fail('active_relationship_count_mismatch');
  }
}

export async function runPatientOrganizationLifecycle(
  store: PatientOrganizationLifecycleStore,
  command: PatientOrganizationLifecycleCommand,
): Promise<Readonly<{ status: PatientOrganizationLifecycleStatus; activeRelationships: number }>> {
  try {
    await store.begin(command === 'status');
    const before = await store.readProbe(command !== 'status');
    assertCanonicalProbe(before);
    const current = before.targetStatus as PatientOrganizationLifecycleStatus;
    const targetStatus = desiredStatus(command, current);
    if (command !== 'status' && current !== targetStatus) {
      const changedRows = await store.setTargetStatus(targetStatus);
      if (changedRows !== 1) fail('reserved_target_update_mismatch');
    }
    const after = command === 'status' ? before : await store.readProbe(false);
    assertPostcondition(command, after);
    await store.commit();
    return {
      status: after.targetStatus as PatientOrganizationLifecycleStatus,
      activeRelationships: after.sharedPatientActiveRows,
    };
  } catch (error) {
    await store.rollback().catch(() => undefined);
    throw error;
  }
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail('invalid_probe_result');
  return parsed;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function createPgStore(client: PoolClient): PatientOrganizationLifecycleStore {
  return {
    async begin(readOnly) {
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
    },
    async readProbe(lockTarget) {
      const target = await client.query<{ status: unknown }>(
        `
          SELECT status
          FROM public.org_enrollments
          WHERE id = $1::uuid
            AND organization_id = $2::uuid
            AND platform_user_id = $3::uuid
          ${lockTarget ? 'FOR UPDATE' : ''}
        `,
        [TARGET.enrollmentId, TARGET.organizationId, TARGET.platformUserId],
      );
      const aggregate = await client.query<{
        database_name: unknown;
        target_rows: unknown;
        retained_active_rows: unknown;
        shared_relationship_rows: unknown;
        shared_active_rows: unknown;
      }>(
        `
          SELECT
            current_database()::text AS database_name,
            count(*) FILTER (
              WHERE id = $1::uuid
                AND organization_id = $2::uuid
                AND platform_user_id = $3::uuid
            )::int AS target_rows,
            count(*) FILTER (
              WHERE id = $4::uuid
                AND organization_id = $5::uuid
                AND platform_user_id = $3::uuid
                AND status = 'active'
            )::int AS retained_active_rows,
            count(*) FILTER (WHERE platform_user_id = $3::uuid)::int AS shared_relationship_rows,
            count(*) FILTER (
              WHERE platform_user_id = $3::uuid AND status = 'active'
            )::int AS shared_active_rows
          FROM public.org_enrollments
          WHERE platform_user_id = $3::uuid
        `,
        [
          TARGET.enrollmentId,
          TARGET.organizationId,
          TARGET.platformUserId,
          TARGET.retainedEnrollmentId,
          TARGET.retainedOrganizationId,
        ],
      );
      const row = aggregate.rows[0];
      if (!row) fail('probe_result_missing');
      return {
        databaseName: stringOrNull(row.database_name) ?? '',
        targetRows: numberValue(row.target_rows),
        targetStatus: stringOrNull(target.rows[0]?.status),
        retainedActiveRows: numberValue(row.retained_active_rows),
        sharedPatientRelationshipRows: numberValue(row.shared_relationship_rows),
        sharedPatientActiveRows: numberValue(row.shared_active_rows),
      };
    },
    async setTargetStatus(status) {
      const result = await client.query(
        `
          UPDATE public.org_enrollments
          SET status = $1
          WHERE id = $2::uuid
            AND organization_id = $3::uuid
            AND platform_user_id = $4::uuid
            AND status IN ('active', 'discharged')
        `,
        [status, TARGET.enrollmentId, TARGET.organizationId, TARGET.platformUserId],
      );
      return result.rowCount ?? 0;
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      await client.query('ROLLBACK');
    },
  };
}

export async function runPatientOrganizationLifecycleCli(input: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): Promise<void> {
  const { command } = parsePatientOrganizationLifecycleArgs(input.argv);
  const databaseUrl = input.env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) fail('database_url_required');
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(input.env.PGOPTIONS?.trim() ? { options: input.env.PGOPTIONS.trim() } : {}),
    max: 1,
  });
  try {
    const client = await pool.connect();
    try {
      const result = await runPatientOrganizationLifecycle(createPgStore(client), command);
      (input.log ?? console.log)(
        `patient_organization_test_lifecycle:${result.status};active_relationships=${result.activeRelationships}`,
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  void runPatientOrganizationLifecycleCli({
    argv: process.argv.slice(2),
    env: process.env,
  }).catch((error: unknown) => {
    const code =
      error instanceof PatientOrganizationLifecycleError
        ? error.code
        : 'patient_organization_test_lifecycle_failed';
    process.stderr.write(`patient_organization_test_lifecycle_failed:${code}\n`);
    process.exitCode = 1;
  });
}
