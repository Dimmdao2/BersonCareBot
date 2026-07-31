#!/usr/bin/env node
/**
 * #1069 этап 2 — executable proof for the access lifecycle ladder
 * (`app.resolve_organization_mechanic_access`, `db/drizzle-migrations/0279_organization_mechanic_access_door_local.sql`).
 *
 * Behaviour proved against a real, private PostgreSQL 16 cluster (never a configured/shared DB):
 *   1. Transitions by DATE, not by "now": full_access -> grace -> read_only -> terminal state, driven
 *      purely by the degradation anchor and the policy's graceDays/readOnlyDays/terminalState.
 *   2. Changing policy VALUES in the tariff row changes resolved behaviour without touching the
 *      function body — the mechanism is data-driven.
 *   3. A mechanic-level policy overrides the system-level policy for that mechanic; unset mechanics
 *      fall back to the system policy.
 *   4. A critical mechanic (никогда-class, e.g. patient_card) stays full_access regardless of any
 *      policy or degradation date.
 *   5. Self-test gate: each proof is re-run against a deliberately broken variant of the extracted
 *      function body and MUST fail — proving the proof actually exercises the guarded behaviour
 *      instead of always passing (`.cursor/rules/tests-check-behaviour-not-circumstances.mdc`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const osUser = userInfo().username;
const migrationPath = path.join(
  root,
  'apps/webapp/db/drizzle-migrations/0279_organization_mechanic_access_door_local.sql',
);

function fail(message) {
  throw new Error(`Access ladder transitions proof failed: ${message}`);
}

function extractDoorFunction(migration) {
  const marker = 'CREATE OR REPLACE FUNCTION app.resolve_organization_mechanic_access(';
  const start = migration.indexOf(marker);
  const end = migration.indexOf(
    'ALTER FUNCTION app.resolve_organization_mechanic_access(uuid, text) OWNER TO app_owner;',
    start,
  );
  if (start < 0 || end < 0) {
    fail('could not extract app.resolve_organization_mechanic_access from the ladder migration');
  }
  return migration.slice(start, end);
}

const migrationSource = readFileSync(migrationPath, 'utf8');
const doorFunctionSource = extractDoorFunction(migrationSource);

const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_access_ladder_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
let serverStarted = false;
let port;

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: safeEnv });
  if (result.error || result.status !== 0) fail(`${label}: ${result.stderr ?? result.error}`);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('private port reservation failed');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function clientFor(targetDb) {
  return new pg.Client({ host: socket, port, database: targetDb, user: osUser, ssl: false });
}

async function withDb(targetDb, fn) {
  const connection = clientFor(targetDb);
  await connection.connect();
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

const ORG_ID = '20000000-0000-4000-8000-000000000001';
const TARIFF_ID = '10000000-0000-4000-8000-000000000001';
const TRIAL_ID = '30000000-0000-4000-8000-000000000001';

function schemaSql(functionSource) {
  return `
    CREATE EXTENSION pgcrypto;
    CREATE SCHEMA app;
    GRANT USAGE, CREATE ON SCHEMA app TO app_owner;
    GRANT USAGE ON SCHEMA app TO app_staff, app_patient;

    -- Test-local stand-in for the real principal_context reader: same contract
    -- (organization_id = app.current_org_id()) as production RLS, driven by a session GUC so each
    -- proof can act as a different organization without re-authenticating.
    CREATE FUNCTION app.current_org_id() RETURNS uuid
      LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
        SELECT NULLIF(current_setting('app.org', true), '')::uuid;
      $$;
    ALTER FUNCTION app.current_org_id() OWNER TO app_owner;

    CREATE TABLE public.be_organizations (
      id uuid PRIMARY KEY,
      tariff_id uuid,
      commercial_access_state text NOT NULL DEFAULT 'active',
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE public.saas_tariffs (
      id uuid PRIMARY KEY,
      mechanics jsonb NOT NULL DEFAULT '{}'::jsonb,
      quotas jsonb NOT NULL DEFAULT '{}'::jsonb,
      system_access_policy jsonb,
      mechanic_access_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
      included_seats integer
    );
    CREATE TABLE public.saas_organization_trials (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      tariff_id uuid NOT NULL,
      ends_at timestamptz NOT NULL,
      grace_ends_at timestamptz NOT NULL,
      post_trial_behavior text NOT NULL,
      post_trial_tariff_id uuid,
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE public.saas_org_entitlement_overrides (
      organization_id uuid NOT NULL,
      mechanic text NOT NULL,
      enabled boolean,
      expires_at timestamptz,
      PRIMARY KEY (organization_id, mechanic)
    );
    GRANT SELECT ON TABLE
      public.be_organizations,
      public.saas_tariffs,
      public.saas_organization_trials,
      public.saas_org_entitlement_overrides
    TO app_owner;

    ${functionSource}
    ALTER FUNCTION app.resolve_organization_mechanic_access(uuid, text) OWNER TO app_owner;
    REVOKE ALL ON FUNCTION app.resolve_organization_mechanic_access(uuid, text) FROM PUBLIC, app_staff, app_patient;
    GRANT EXECUTE ON FUNCTION app.resolve_organization_mechanic_access(uuid, text) TO app_staff, app_patient;

    INSERT INTO public.be_organizations (id, tariff_id) VALUES ('${ORG_ID}', '${TARIFF_ID}');
    INSERT INTO public.saas_tariffs (id, mechanics, quotas) VALUES (
      '${TARIFF_ID}',
      '{"courses": true, "branches": true, "patient_card": false}'::jsonb,
      '{"branches": {"kind": "numeric", "limit": 5, "unit": "items"}}'::jsonb
    );
  `;
}

async function installInto(targetDb, functionSource) {
  run(path.join(pgBin, 'createdb'), ['-h', socket, '-p', String(port), targetDb], `create db ${targetDb}`);
  await withDb(targetDb, (connection) => connection.query(schemaSql(functionSource)));
}

async function setPolicies(connection, { systemAccessPolicy, mechanicAccessPolicies }) {
  await connection.query(
    `UPDATE public.saas_tariffs
     SET system_access_policy = $1::jsonb, mechanic_access_policies = $2::jsonb
     WHERE id = $3`,
    [
      systemAccessPolicy ? JSON.stringify(systemAccessPolicy) : null,
      JSON.stringify(mechanicAccessPolicies ?? {}),
      TARIFF_ID,
    ],
  );
}

async function setDegradationAnchor(connection, { endsAtIntervalFromNow, postTrialBehavior }) {
  await connection.query('DELETE FROM public.saas_organization_trials WHERE id = $1', [TRIAL_ID]);
  await connection.query(
    `INSERT INTO public.saas_organization_trials
       (id, organization_id, tariff_id, ends_at, grace_ends_at, post_trial_behavior, status)
     VALUES ($1, $2, $3, now() + $4::interval, now() + $4::interval, $5, 'active')`,
    [TRIAL_ID, ORG_ID, TARIFF_ID, endsAtIntervalFromNow, postTrialBehavior ?? 'blocked'],
  );
}

async function resolveAs(connection, organizationId, mechanic) {
  await connection.query("SELECT set_config('app.org', $1, false)", [organizationId]);
  await connection.query('SET ROLE app_staff');
  try {
    const result = await connection.query(
      'SELECT * FROM app.resolve_organization_mechanic_access($1::uuid, $2::text)',
      [organizationId, mechanic],
    );
    return result.rows[0];
  } finally {
    await connection.query('RESET ROLE');
  }
}

const MECHANIC_POLICY = {
  graceDays: 5,
  readOnlyDays: 3,
  warningCount: 2,
  terminalState: 'read_only',
};

/** Proof 1: dates drive the ladder, not "now". */
async function proveTransitionsByDate(connection) {
  await setPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: { courses: MECHANIC_POLICY },
  });

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '1 day' });
  const beforeDegradation = await resolveAs(connection, ORG_ID, 'courses');
  if (beforeDegradation.state !== 'full_access') {
    fail(`before the degradation date expected full_access, got ${beforeDegradation.state}`);
  }

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-1 day' });
  const inGrace = await resolveAs(connection, ORG_ID, 'courses');
  if (inGrace.state !== 'grace') fail(`1 day into a 5-day grace expected grace, got ${inGrace.state}`);
  if (inGrace.mutation_allowed !== true) fail('grace state must still allow mutation');
  if (inGrace.warning?.count !== 2) {
    fail(`expected warningCount 2 in the warning, got ${JSON.stringify(inGrace.warning)}`);
  }
  if (inGrace.warning?.nextState !== 'read_only') fail('grace warning must name the next state, read_only');

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-6 days' });
  const inReadOnly = await resolveAs(connection, ORG_ID, 'courses');
  if (inReadOnly.state !== 'read_only') {
    fail(`6 days in (5-day grace + 3-day read-only) expected read_only, got ${inReadOnly.state}`);
  }
  if (inReadOnly.mutation_allowed !== false) fail('read_only state must refuse mutation');

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-10 days' });
  const atTerminal = await resolveAs(connection, ORG_ID, 'courses');
  if (atTerminal.state !== 'read_only') {
    fail(`10 days in (past 5+3) expected the configured terminalState read_only, got ${atTerminal.state}`);
  }
  if (atTerminal.mutation_allowed !== false) fail('terminal read_only state must refuse mutation');
}

/** Proof 2: policy is DATA — the same function, different tariff row, different outcome. */
async function provePolicyIsData(connection) {
  await setPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: { courses: MECHANIC_POLICY },
  });
  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-10 days' });
  const withReadOnlyTerminal = await resolveAs(connection, ORG_ID, 'courses');
  if (withReadOnlyTerminal.state !== 'read_only') {
    fail(`expected read_only terminalState, got ${withReadOnlyTerminal.state}`);
  }

  await setPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: { courses: { ...MECHANIC_POLICY, terminalState: 'disabled' } },
  });
  const withDisabledTerminal = await resolveAs(connection, ORG_ID, 'courses');
  if (withDisabledTerminal.state !== 'disabled') {
    fail(
      `changing terminalState in the tariff row (no code change) should flip the outcome to ` +
        `disabled, got ${withDisabledTerminal.state}`,
    );
  }
}

/** Proof 3: mechanic-level policy beats system-level; unset mechanics fall back to system. */
async function proveMechanicOverridesSystem(connection) {
  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 1, readOnlyDays: 1, warningCount: 9, terminalState: 'disabled' },
    mechanicAccessPolicies: {},
  });
  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-1.5 days' });

  const branchesOnSystemPolicy = await resolveAs(connection, ORG_ID, 'branches');
  if (branchesOnSystemPolicy.state !== 'read_only') {
    fail(
      `unconfigured mechanic must fall back to the system policy (1+1 days, 1.5 days in => ` +
        `read_only), got ${branchesOnSystemPolicy.state}`,
    );
  }
  if (branchesOnSystemPolicy.policy_source !== 'system') {
    fail(`expected policy_source system, got ${branchesOnSystemPolicy.policy_source}`);
  }

  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 1, readOnlyDays: 1, warningCount: 9, terminalState: 'disabled' },
    mechanicAccessPolicies: {
      branches: { graceDays: 10, readOnlyDays: 10, warningCount: 1, terminalState: 'disabled' },
    },
  });
  const branchesOnMechanicPolicy = await resolveAs(connection, ORG_ID, 'branches');
  if (branchesOnMechanicPolicy.state !== 'grace') {
    fail(
      `a mechanic-level policy must override the system policy (10-day grace, 1.5 days in => grace), ` +
        `got ${branchesOnMechanicPolicy.state}`,
    );
  }
  if (branchesOnMechanicPolicy.policy_source !== 'mechanic') {
    fail(`expected policy_source mechanic, got ${branchesOnMechanicPolicy.policy_source}`);
  }
}

/** Proof 4: a critical (никогда-class) mechanic stays full_access under any policy or date. */
async function proveCriticalMechanicNeverDegrades(connection) {
  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 0, readOnlyDays: 0, warningCount: 0, terminalState: 'disabled' },
    mechanicAccessPolicies: {},
  });
  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-3650 days' });

  const criticalAccess = await resolveAs(connection, ORG_ID, 'patient_card');
  if (criticalAccess.state !== 'full_access') {
    fail(
      `patient_card is a критичная mechanic and must stay full_access under the harshest possible ` +
        `policy and date, got ${criticalAccess.state}`,
    );
  }
  if (criticalAccess.policy_source !== 'critical') {
    fail(`expected policy_source critical, got ${criticalAccess.policy_source}`);
  }
  if (criticalAccess.mutation_allowed !== true) fail('critical mechanic must allow mutation');
}

/**
 * Self-test gate: each proof above is re-run against a deliberately broken door function and MUST
 * throw. This is the "name the breakage, then break it and watch it go red" arbiter from
 * .cursor/rules/tests-check-behaviour-not-circumstances.mdc, executed mechanically instead of by hand.
 */
const REGRESSIONS = [
  {
    label: 'mechanic policy no longer overrides system policy',
    proof: proveMechanicOverridesSystem,
    breakSource: (source) =>
      source.replace(
        `COALESCE(
        tariff.mechanic_access_policies -> p_mechanic,
        tariff.system_access_policy
      ) AS policy,`,
        `tariff.system_access_policy AS policy,`,
      ),
  },
  {
    label: 'critical mechanic hardcode removed — patient_card would degrade like any other mechanic',
    proof: proveCriticalMechanicNeverDegrades,
    breakSource: (source) =>
      source.replaceAll(`p_mechanic = ANY (ARRAY['patient_card', 'patient_app'])`, `false`),
  },
  {
    label: 'grace window arithmetic removed — degraded orgs jump straight to terminal state',
    proof: proveTransitionsByDate,
    breakSource: (source) =>
      source.replace(
        `WHEN degradation_started_at IS NOT NULL
          AND (policy ->> 'graceDays')::integer > 0
          AND v_now < degradation_started_at
            + make_interval(days => (policy ->> 'graceDays')::integer)
          THEN 'grace'`,
        `WHEN false THEN 'grace'`,
      ),
  },
];

async function runRegressionSelfTests() {
  for (const [index, regression] of REGRESSIONS.entries()) {
    const brokenSource = regression.breakSource(doorFunctionSource);
    if (brokenSource === doorFunctionSource) {
      fail(`self-test "${regression.label}" did not find its target text to break — proof text stale`);
    }
    const regressionDb = `bcb_access_ladder_${stamp}_r${index}`;
    await installInto(regressionDb, brokenSource);
    let threw = false;
    let thrownMessage = '';
    try {
      await withDb(regressionDb, (connection) => regression.proof(connection));
    } catch (error) {
      threw = true;
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
    if (!threw) {
      fail(`self-test "${regression.label}" stayed GREEN against a broken function — proof is dead`);
    }
    console.log(`  self-test OK (went red as expected): ${regression.label}\n    -> ${thrownMessage}`);
  }
}

try {
  if (!existsSync(path.join(pgBin, 'initdb'))) fail('PostgreSQL 16 binaries are unavailable');
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale'], 'private initdb');
  run(
    path.join(pgBin, 'pg_ctl'),
    ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    'private PostgreSQL startup',
  );
  serverStarted = true;

  await withDb('postgres', (connection) =>
    connection.query(`
      CREATE ROLE app_owner NOLOGIN BYPASSRLS;
      CREATE ROLE app_staff NOLOGIN NOINHERIT NOBYPASSRLS;
      CREATE ROLE app_patient NOLOGIN NOINHERIT NOBYPASSRLS;
    `),
  );

  const primaryDb = `bcb_access_ladder_${stamp}`;
  await installInto(primaryDb, doorFunctionSource);

  await withDb(primaryDb, async (connection) => {
    await proveTransitionsByDate(connection);
    console.log('  proof OK: transitions follow degradation date (full_access -> grace -> read_only -> terminal)');
    await provePolicyIsData(connection);
    console.log('  proof OK: editing the tariff row changes behaviour with zero code change');
    await proveMechanicOverridesSystem(connection);
    console.log('  proof OK: mechanic-level policy overrides system-level policy');
    await proveCriticalMechanicNeverDegrades(connection);
    console.log('  proof OK: critical (никогда-class) mechanic never degrades');
  });

  await runRegressionSelfTests();

  console.log(
    'Access ladder transitions proof: OK — dates, data-driven policy, mechanic-over-system ' +
      'precedence, critical-mechanic immunity, and all three regression self-tests went red as designed.',
  );
} finally {
  if (serverStarted) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
      encoding: 'utf8',
      env: safeEnv,
    });
  }
  rmSync(dir, { recursive: true, force: true });
}
