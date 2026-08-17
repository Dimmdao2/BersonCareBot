#!/usr/bin/env tsx
/**
 * Operator client for the U5A shared-patient capability on the named TEST database.
 *
 * The root-only host wrapper installs and removes the closed SECURITY DEFINER function. This client
 * first verifies the exact database and the sanctioned operator login using pg_catalog only, then
 * invokes that function. It never reads or writes a product table directly.
 */
import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';

const REQUIRED_DATABASE = 'bersoncarebot_test';
const OPERATOR_DATABASE_URL_ENV = 'SAAS_ISOLATION_OPERATOR_DATABASE_URL';
const CAPABILITY = 'app.control_u5a_patient_organization_fixture(text)';

export type PatientOrganizationLifecycleStatus = 'active' | 'discharged';
export type PatientOrganizationLifecycleCommand = 'status' | 'discharge' | 'restore';

export type PatientOrganizationOperatorProbe = Readonly<{
  urlLoginRole: string;
  databaseName: string;
  sessionRole: string;
  currentRole: string;
  canLogin: boolean;
  inherit: boolean;
  superuser: boolean;
  createDb: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  appRoleMember: boolean;
  sanctionedMembershipTopology: boolean;
  directProductTableAccess: boolean;
  capabilityExecute: boolean;
}>;

export type PatientOrganizationLifecycleResult = Readonly<{
  status: PatientOrganizationLifecycleStatus;
  activeRelationships: number;
}>;

export type PatientOrganizationLifecyclePort = Readonly<{
  readOperatorProbe(): Promise<PatientOrganizationOperatorProbe>;
  invoke(command: PatientOrganizationLifecycleCommand): Promise<PatientOrganizationLifecycleResult>;
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

export function parsePatientOrganizationOperatorDatabaseUrl(rawValue: string): Readonly<{
  connectionString: string;
  loginRole: string;
}> {
  const connectionString = rawValue.trim();
  if (!connectionString) fail('operator_database_url_required');
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    fail('operator_database_url_invalid');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    fail('operator_database_url_invalid');
  }
  for (const key of parsed.searchParams.keys()) {
    if (key.toLowerCase() === 'options') fail('operator_database_url_options_forbidden');
  }
  let loginRole: string;
  try {
    loginRole = decodeURIComponent(parsed.username);
  } catch {
    fail('operator_database_url_invalid');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(loginRole)) {
    fail('operator_database_url_login_invalid');
  }
  return { connectionString, loginRole };
}

export function parsePatientOrganizationLifecycleArgs(
  argv: readonly string[],
): Readonly<{ command: PatientOrganizationLifecycleCommand; execute: boolean }> {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const command = normalizedArgv[0];
  const trailing = normalizedArgv.slice(1);
  if (command !== 'status' && command !== 'discharge' && command !== 'restore') fail('usage');
  if (trailing.some((arg) => arg !== '--execute') || trailing.length > 1) fail('usage');
  const execute = trailing[0] === '--execute';
  if (command === 'status' && execute) fail('status_execute_forbidden');
  if (command !== 'status' && !execute) fail('explicit_execute_required');
  return { command, execute };
}

function assertOperatorProbe(probe: PatientOrganizationOperatorProbe): void {
  if (probe.databaseName !== REQUIRED_DATABASE) fail('wrong_database');
  if (
    probe.urlLoginRole !== probe.sessionRole ||
    probe.sessionRole !== probe.currentRole ||
    !probe.canLogin ||
    !probe.inherit ||
    probe.superuser ||
    probe.createDb ||
    probe.createRole ||
    probe.replication ||
    probe.bypassRls ||
    probe.appRoleMember ||
    !probe.sanctionedMembershipTopology ||
    probe.directProductTableAccess ||
    !probe.capabilityExecute
  ) {
    fail('operator_preflight_failed');
  }
}

export async function runPatientOrganizationLifecycle(
  port: PatientOrganizationLifecyclePort,
  command: PatientOrganizationLifecycleCommand,
): Promise<PatientOrganizationLifecycleResult> {
  assertOperatorProbe(await port.readOperatorProbe());
  const result = await port.invoke(command);
  if (
    (result.status !== 'active' && result.status !== 'discharged') ||
    result.activeRelationships !== (result.status === 'active' ? 2 : 1)
  ) {
    fail('lifecycle_postcondition_failed');
  }
  if (command === 'discharge' && result.status !== 'discharged')
    fail('lifecycle_postcondition_failed');
  if (command === 'restore' && result.status !== 'active') fail('lifecycle_postcondition_failed');
  return result;
}

function booleanValue(value: unknown): boolean {
  if (value === true || value === false) return value;
  fail('invalid_operator_probe');
}

function stringValue(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  fail('invalid_operator_probe');
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail('invalid_capability_result');
  return parsed;
}

function createPgPort(client: PoolClient, urlLoginRole: string): PatientOrganizationLifecyclePort {
  return {
    async readOperatorProbe() {
      const result = await client.query<{
        database_name: unknown;
        session_role: unknown;
        current_role: unknown;
        rolcanlogin: unknown;
        rolinherit: unknown;
        rolsuper: unknown;
        rolcreatedb: unknown;
        rolcreaterole: unknown;
        rolreplication: unknown;
        rolbypassrls: unknown;
        app_role_member: unknown;
        sanctioned_membership_topology: unknown;
        direct_product_table_access: unknown;
        capability_execute: unknown;
      }>(`
        SELECT
          current_database()::text AS database_name,
          session_user::text AS session_role,
          current_user::text AS current_role,
          role.rolcanlogin,
          role.rolinherit,
          role.rolsuper,
          role.rolcreatedb,
          role.rolcreaterole,
          role.rolreplication,
          role.rolbypassrls,
          (
            pg_has_role(current_user, 'app_owner', 'MEMBER')
            OR pg_has_role(current_user, 'app_staff', 'MEMBER')
            OR pg_has_role(current_user, 'app_patient', 'MEMBER')
            OR pg_has_role(current_user, 'app_worker', 'MEMBER')
          ) AS app_role_member,
          (
            (
              SELECT count(*) = 1
                AND bool_and(
                  granted_role.rolname = 'saas_telemetry_operator'
                  AND NOT membership.admin_option
                  AND membership.inherit_option
                  AND membership.set_option
                )
              FROM pg_catalog.pg_auth_members AS membership
              JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
              JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
              WHERE member_role.rolname = session_user
            )
            AND EXISTS (
              SELECT 1
              FROM pg_catalog.pg_roles AS capability_role
              WHERE capability_role.rolname = 'saas_telemetry_operator'
                AND NOT capability_role.rolcanlogin
                AND NOT capability_role.rolinherit
                AND NOT capability_role.rolsuper
                AND NOT capability_role.rolcreatedb
                AND NOT capability_role.rolcreaterole
                AND NOT capability_role.rolreplication
                AND NOT capability_role.rolbypassrls
            )
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_auth_members AS membership
              JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
              WHERE member_role.rolname = 'saas_telemetry_operator'
            )
          ) AS sanctioned_membership_topology,
          (
            has_table_privilege(current_user, 'public.org_enrollments', 'SELECT')
            OR has_table_privilege(current_user, 'public.org_enrollments', 'INSERT')
            OR has_table_privilege(current_user, 'public.org_enrollments', 'UPDATE')
            OR has_table_privilege(current_user, 'public.org_enrollments', 'DELETE')
          ) AS direct_product_table_access,
          has_function_privilege(current_user, '${CAPABILITY}', 'EXECUTE') AS capability_execute
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = current_user
      `);
      const row = result.rows[0];
      if (!row) fail('operator_probe_missing');
      return {
        urlLoginRole,
        databaseName: stringValue(row.database_name),
        sessionRole: stringValue(row.session_role),
        currentRole: stringValue(row.current_role),
        canLogin: booleanValue(row.rolcanlogin),
        inherit: booleanValue(row.rolinherit),
        superuser: booleanValue(row.rolsuper),
        createDb: booleanValue(row.rolcreatedb),
        createRole: booleanValue(row.rolcreaterole),
        replication: booleanValue(row.rolreplication),
        bypassRls: booleanValue(row.rolbypassrls),
        appRoleMember: booleanValue(row.app_role_member),
        sanctionedMembershipTopology: booleanValue(row.sanctioned_membership_topology),
        directProductTableAccess: booleanValue(row.direct_product_table_access),
        capabilityExecute: booleanValue(row.capability_execute),
      };
    },
    async invoke(command) {
      const result = await client.query<{
        target_status: unknown;
        active_relationships: unknown;
      }>('SELECT * FROM app.control_u5a_patient_organization_fixture($1)', [command]);
      const row = result.rows[0];
      if (!row || (row.target_status !== 'active' && row.target_status !== 'discharged')) {
        fail('invalid_capability_result');
      }
      return {
        status: row.target_status,
        activeRelationships: numberValue(row.active_relationships),
      };
    },
  };
}

export async function runPatientOrganizationLifecycleCli(input: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): Promise<void> {
  const { command } = parsePatientOrganizationLifecycleArgs(input.argv);
  const operatorDatabase = parsePatientOrganizationOperatorDatabaseUrl(
    input.env[OPERATOR_DATABASE_URL_ENV] ?? '',
  );
  const pool = new Pool({
    connectionString: operatorDatabase.connectionString,
    options: '',
    application_name: 'bcb_u5a_patient_organization_fixture_operator',
    max: 1,
    statement_timeout: 10_000,
    query_timeout: 12_000,
  });
  try {
    const client = await pool.connect();
    try {
      const result = await runPatientOrganizationLifecycle(
        createPgPort(client, operatorDatabase.loginRole),
        command,
      );
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
    const postgresCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(error.code)
        ? `postgres_${error.code}`
        : 'patient_organization_test_lifecycle_failed';
    const code = error instanceof PatientOrganizationLifecycleError ? error.code : postgresCode;
    process.stderr.write(`patient_organization_test_lifecycle_failed:${code}\n`);
    process.exitCode = 1;
  });
}
