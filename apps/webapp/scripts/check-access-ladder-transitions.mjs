#!/usr/bin/env node
/**
 * #1069 этап 2 — executable proof for the access lifecycle ladder
 * (`app.resolve_organization_mechanic_access` and the separate cabinet-access resolver).
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
// Both doors are redefined by the forward-only 0320 migration. The proof must extract those
// CURRENT bodies, not the applied 0305 migration, otherwise a green private-cluster run would not
// cover live tariff edits.
const mechanicMigrationPath = path.join(
  root,
  'apps/webapp/db/drizzle-migrations/0320_tariff_policy_live_progression_local.sql',
);
const cabinetMigrationPath = mechanicMigrationPath;
const mechanicRegistryPath = path.join(
  root,
  'apps/webapp/src/modules/org-entitlements/types.ts',
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

function extractCabinetFunction(migration) {
  const marker = 'CREATE OR REPLACE FUNCTION app.resolve_organization_cabinet_access(';
  const start = migration.indexOf(marker);
  const end = migration.indexOf(
    'ALTER FUNCTION app.resolve_organization_cabinet_access(uuid) OWNER TO app_owner;',
    start,
  );
  if (start < 0 || end < 0) {
    fail('could not extract app.resolve_organization_cabinet_access from the ladder migration');
  }
  return migration.slice(start, end);
}

function readMechanicRegistry(source) {
  const start = source.indexOf('export const MECHANIC_REGISTRY = {');
  const end = source.indexOf('} as const satisfies Record<string, MechanicDefinition>;', start);
  if (start < 0 || end < 0) fail('could not read the canonical MECHANIC_REGISTRY');
  const entries = [...source.slice(start, end).matchAll(/^\s{2}([a-z0-9_]+):\s*\{\s*class:\s*'([^']+)'/gm)]
    .map((match) => ({ mechanic: match[1], mechanicClass: match[2] }));
  if (entries.length === 0) fail('canonical MECHANIC_REGISTRY unexpectedly has no entries');
  return entries;
}

const mechanicMigrationSource = readFileSync(mechanicMigrationPath, 'utf8');
const cabinetMigrationSource = readFileSync(cabinetMigrationPath, 'utf8');
const doorFunctionSource = extractDoorFunction(mechanicMigrationSource);
const cabinetFunctionSource = extractCabinetFunction(cabinetMigrationSource);
const mechanicRegistry = readMechanicRegistry(readFileSync(mechanicRegistryPath, 'utf8'));
const configurableMechanics = mechanicRegistry.filter(({ mechanicClass }) => mechanicClass !== 'никогда');
const criticalMechanics = mechanicRegistry.filter(({ mechanicClass }) => mechanicClass === 'никогда');

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
const SUBSCRIPTION_ID = '40000000-0000-4000-8000-000000000001';

function schemaSql(functionSource, cabinetSource) {
  const configuredMechanics = Object.fromEntries(
    mechanicRegistry.map(({ mechanic, mechanicClass }) => [mechanic, mechanicClass !== 'никогда']),
  );
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
    CREATE TABLE public.admin_audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      action text NOT NULL,
      target_id text,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
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
    -- §5a item 7.0 — the money side of the ladder. Same columns the doors read in production.
    CREATE TABLE public.saas_billing_subscriptions (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      tariff_id uuid NOT NULL,
      source text NOT NULL,
      status text NOT NULL,
      current_period_starts_at timestamptz,
      current_period_ends_at timestamptz,
      UNIQUE (organization_id, source)
    );
    GRANT SELECT ON TABLE
      public.be_organizations,
      public.saas_tariffs,
      public.admin_audit_log,
      public.saas_organization_trials,
      public.saas_org_entitlement_overrides,
      public.saas_billing_subscriptions
    TO app_owner;
    ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;
    CREATE POLICY admin_audit_log_access_policy_history_select ON public.admin_audit_log
      FOR SELECT TO app_owner
      USING (action = 'saas_tariff_update' AND target_id IS NOT NULL);

    -- The access doors call this existing paid-period switch. This private ladder proof has no
    -- paid-period snapshot fixture, so it deliberately supplies its live-row branch only; the
    -- snapshot switch itself is covered by saasBillingTariffSnapshot.devDbProof.test.ts.
    CREATE FUNCTION app.saas_billing_effective_tariff(p_organization_id uuid, p_tariff_id uuid)
    RETURNS SETOF public.saas_tariffs
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
      SELECT * FROM public.saas_tariffs WHERE id = p_tariff_id;
    $$;
    ALTER FUNCTION app.saas_billing_effective_tariff(uuid, uuid) OWNER TO app_owner;

    ${functionSource}
    ALTER FUNCTION app.resolve_organization_mechanic_access(uuid, text) OWNER TO app_owner;
    REVOKE ALL ON FUNCTION app.resolve_organization_mechanic_access(uuid, text) FROM PUBLIC, app_staff, app_patient;
    GRANT EXECUTE ON FUNCTION app.resolve_organization_mechanic_access(uuid, text) TO app_staff, app_patient;

    ${cabinetSource}
    ALTER FUNCTION app.resolve_organization_cabinet_access(uuid) OWNER TO app_owner;
    REVOKE ALL ON FUNCTION app.resolve_organization_cabinet_access(uuid) FROM PUBLIC, app_staff, app_patient;
    GRANT EXECUTE ON FUNCTION app.resolve_organization_cabinet_access(uuid) TO app_staff, app_patient;

    CREATE TABLE public.cabinet_payload (
      organization_id uuid NOT NULL,
      payload text NOT NULL
    );

    INSERT INTO public.be_organizations (id, tariff_id) VALUES ('${ORG_ID}', '${TARIFF_ID}');
    INSERT INTO public.saas_tariffs (id, mechanics, quotas) VALUES (
      '${TARIFF_ID}',
      '${JSON.stringify(configuredMechanics)}'::jsonb,
      '{"branches": {"kind": "numeric", "limit": 5, "unit": "items"}, "patient_count": {"kind": "numeric", "limit": 50, "unit": "items"}, "files": {"kind": "numeric", "limit": 1048576, "unit": "bytes"}}'::jsonb
    );
    UPDATE public.saas_tariffs SET included_seats = 5 WHERE id = '${TARIFF_ID}';
    INSERT INTO public.cabinet_payload (organization_id, payload)
      VALUES ('${ORG_ID}', 'same-data-before-and-after-renewal');
  `;
}

async function installInto(targetDb, functionSource, cabinetSource = cabinetFunctionSource) {
  run(path.join(pgBin, 'createdb'), ['-h', socket, '-p', String(port), targetDb], `create db ${targetDb}`);
  await withDb(targetDb, (connection) => connection.query(schemaSql(functionSource, cabinetSource)));
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

async function clearPolicyHistory(connection) {
  await connection.query(
    `DELETE FROM public.admin_audit_log
     WHERE action = 'saas_tariff_update' AND target_id = $1`,
    [TARIFF_ID],
  );
}

/** Same before/after shape that pgPlatformEntitlements.appendAudit persists for a tariff edit. */
async function editPolicies(connection, { systemAccessPolicy, mechanicAccessPolicies }) {
  const beforeResult = await connection.query(
    `SELECT system_access_policy, mechanic_access_policies
     FROM public.saas_tariffs WHERE id = $1`,
    [TARIFF_ID],
  );
  const before = beforeResult.rows[0];
  if (!before) fail('policy edit fixture tariff is missing');
  await setPolicies(connection, { systemAccessPolicy, mechanicAccessPolicies });
  await connection.query(
    `INSERT INTO public.admin_audit_log (action, target_id, details)
     VALUES ('saas_tariff_update', $1, jsonb_build_object(
       'before', jsonb_build_object(
         'systemAccessPolicy', $2::jsonb,
         'mechanicAccessPolicies', $3::jsonb
       ),
       'after', jsonb_build_object(
         'systemAccessPolicy', $4::jsonb,
         'mechanicAccessPolicies', $5::jsonb
       )
     ))`,
    [
      TARIFF_ID,
      JSON.stringify(before.system_access_policy),
      JSON.stringify(before.mechanic_access_policies),
      JSON.stringify(systemAccessPolicy),
      JSON.stringify(mechanicAccessPolicies ?? {}),
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

/**
 * §5a item 7.0 — the OTHER anchor: an organization with an assigned tariff, no trial at all, and a
 * paid period that ends `endsAtIntervalFromNow` from now. This is the state the product reaches
 * when a clinic is given a tariff and then does or does not pay for the next period.
 */
async function setPaidPeriod(connection, { endsAtIntervalFromNow, status = 'active' }) {
  await connection.query('DELETE FROM public.saas_organization_trials WHERE organization_id = $1', [
    ORG_ID,
  ]);
  await connection.query('DELETE FROM public.saas_billing_subscriptions WHERE id = $1', [
    SUBSCRIPTION_ID,
  ]);
  await connection.query(
    `INSERT INTO public.saas_billing_subscriptions
       (id, organization_id, tariff_id, source, status,
        current_period_starts_at, current_period_ends_at)
     VALUES ($1, $2, $3, 'manual', $5,
             now() + $4::interval - interval '30 days', now() + $4::interval)`,
    [SUBSCRIPTION_ID, ORG_ID, TARIFF_ID, endsAtIntervalFromNow, status],
  );
}

async function clearPaidPeriod(connection) {
  await connection.query('DELETE FROM public.saas_billing_subscriptions WHERE id = $1', [
    SUBSCRIPTION_ID,
  ]);
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

async function resolveCabinetAs(connection, organizationId) {
  await connection.query("SELECT set_config('app.org', $1, false)", [organizationId]);
  await connection.query('SET ROLE app_staff');
  try {
    const result = await connection.query(
      'SELECT * FROM app.resolve_organization_cabinet_access($1::uuid)',
      [organizationId],
    );
    return result.rows[0];
  } finally {
    await connection.query('RESET ROLE');
  }
}

const OWNER_NOTIFICATION = {
  offsetDays: -2,
  condition: 'payment_failed',
  template: 'Оплатите {{тариф}}',
};

const MECHANIC_POLICY = {
  graceDays: 5,
  readOnlyDays: 3,
  notifications: [OWNER_NOTIFICATION],
  terminalState: 'read_only',
};

/** Proof 1: dates drive the ladder, not "now". */
async function proveTransitionsByDate(connection) {
  await clearPolicyHistory(connection);
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
  // §5a item 2.6a — the warning carries the owner's notification rows verbatim plus the anchor
  // they are measured from; there is no agent-chosen notification count any more.
  if ('count' in (inGrace.warning ?? {})) {
    fail(`the warning must not carry an agent-chosen count, got ${JSON.stringify(inGrace.warning)}`);
  }
  if (typeof inGrace.warning?.periodEndsAt !== 'string') {
    fail(`expected the paid-period anchor in the warning, got ${JSON.stringify(inGrace.warning)}`);
  }
  const [storedRow, ...extraRows] = inGrace.warning?.notifications ?? [];
  // jsonb does not preserve key order, so compare field by field rather than by serialisation.
  if (
    extraRows.length > 0 ||
    storedRow?.offsetDays !== OWNER_NOTIFICATION.offsetDays ||
    storedRow?.condition !== OWNER_NOTIFICATION.condition ||
    storedRow?.template !== OWNER_NOTIFICATION.template
  ) {
    fail(`expected the owner notification rows verbatim, got ${JSON.stringify(inGrace.warning)}`);
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
  await clearPolicyHistory(connection);
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

/**
 * §5a 2.9/2.10 — the resolver reads the live tariff on its next question, but uses the immutable
 * edit record to retain a stage that was already running. This covers both ladder subjects:
 * mechanic-level extension while in grace, then system-policy shortening while in read-only.
 */
async function proveLivePolicyChangesAreProspective(connection) {
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: {
      courses: { graceDays: 3, readOnlyDays: 2, notifications: [], terminalState: 'disabled' },
    },
  });
  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-2 days' });
  const beforeExtension = await resolveAs(connection, ORG_ID, 'courses');
  if (beforeExtension.state !== 'grace') {
    fail(`2 days into 3-day grace expected grace before extension, got ${beforeExtension.state}`);
  }
  await editPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: {
      courses: { graceDays: 5, readOnlyDays: 2, notifications: [], terminalState: 'disabled' },
    },
  });
  const afterExtension = await resolveAs(connection, ORG_ID, 'courses');
  if (afterExtension.state !== 'grace') {
    fail(`extending an in-progress grace must keep it in grace, got ${afterExtension.state}`);
  }
  const extendedUntil = Date.parse(afterExtension.warning?.until ?? '');
  if (!Number.isFinite(extendedUntil) || extendedUntil < Date.now() + 2 * 86_400_000) {
    fail(`the extended grace deadline must come from the live tariff, got ${JSON.stringify(afterExtension.warning)}`);
  }

  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 2, readOnlyDays: 5, notifications: [], terminalState: 'disabled' },
    mechanicAccessPolicies: {},
  });
  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-3 days' });
  const beforeShortening = await resolveCabinetAs(connection, ORG_ID);
  if (beforeShortening.state !== 'read_only') {
    fail(`3 days into 2+5 days expected cabinet read_only before shortening, got ${beforeShortening.state}`);
  }
  await editPolicies(connection, {
    systemAccessPolicy: { graceDays: 0, readOnlyDays: 0, notifications: [], terminalState: 'disabled' },
    mechanicAccessPolicies: {},
  });
  const afterShortening = await resolveCabinetAs(connection, ORG_ID);
  if (afterShortening.state !== 'read_only') {
    fail(`shortening must not retroactively eject an in-progress read-only cabinet, got ${afterShortening.state}`);
  }
}

/** Proof 3: mechanic-level policy beats system-level; unset mechanics fall back to system. */
async function proveMechanicOverridesSystem(connection) {
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 1, readOnlyDays: 1, notifications: [], terminalState: 'disabled' },
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
    systemAccessPolicy: { graceDays: 1, readOnlyDays: 1, notifications: [], terminalState: 'disabled' },
    mechanicAccessPolicies: {
      branches: { graceDays: 10, readOnlyDays: 10, notifications: [], terminalState: 'disabled' },
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
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 0, readOnlyDays: 0, notifications: [], terminalState: 'disabled' },
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

/** Proof 5 / §5a 2.1b: every tariff mechanic, without an owner-defined critical class, degrades. */
async function proveNoAgentMechanicExclusions(connection) {
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: { graceDays: 0, readOnlyDays: 0, notifications: [], terminalState: 'disabled' },
    mechanicAccessPolicies: {},
  });
  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-3650 days' });

  for (const { mechanic } of configurableMechanics) {
    const access = await resolveAs(connection, ORG_ID, mechanic);
    if (access.state !== 'disabled') {
      fail(
        `tariff mechanic ${mechanic} was excluded from the ladder without the owner-defined ` +
          `никогда class: expected disabled, got ${access.state}`,
      );
    }
  }
  for (const { mechanic } of criticalMechanics) {
    const access = await resolveAs(connection, ORG_ID, mechanic);
    if (access.state !== 'full_access' || access.policy_source !== 'critical') {
      fail(`owner-defined critical mechanic ${mechanic} must stay outside tariff degradation`);
    }
  }
}

/** Proof 6 / §5a 2.1a: cabinet is a separate subject with all three configured stages. */
async function proveCabinetTransitionsAndDataRestoration(connection) {
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: {
      graceDays: 5,
      readOnlyDays: 3,
      notifications: [OWNER_NOTIFICATION],
      terminalState: 'disabled',
    },
    mechanicAccessPolicies: {},
  });

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '1 day' });
  const full = await resolveCabinetAs(connection, ORG_ID);
  if (full.state !== 'full_access') fail(`cabinet before degradation expected full_access, got ${full.state}`);

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-1 day' });
  const grace = await resolveCabinetAs(connection, ORG_ID);
  // §5a item 2.6a — the cabinet ladder carries the same owner notification rows as the mechanic
  // ladder, and no agent-chosen count.
  if (
    grace.state !== 'grace' ||
    'count' in (grace.warning ?? {}) ||
    grace.warning?.notifications?.[0]?.template !== OWNER_NOTIFICATION.template
  ) {
    fail(`cabinet grace stage expected grace with the owner notification, got ${JSON.stringify(grace)}`);
  }

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-6 days' });
  const readOnly = await resolveCabinetAs(connection, ORG_ID);
  if (readOnly.state !== 'read_only') fail(`cabinet read-only stage expected read_only, got ${readOnly.state}`);

  await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-10 days' });
  const blocked = await resolveCabinetAs(connection, ORG_ID);
  if (blocked.state !== 'disabled') fail(`cabinet terminal stage expected disabled, got ${blocked.state}`);
  const beforeRenewal = await connection.query(
    'SELECT payload FROM public.cabinet_payload WHERE organization_id = $1',
    [ORG_ID],
  );

  // #1069 §2.13: no separate state column to reassert any more — the organization still has its
  // assigned TARIFF_ID (never nulled in this proof), so deleting the trial alone is renewal: no
  // trial, no period, lifecycle active, tariff resolved => the eternal-full-access branch fires.
  await connection.query('DELETE FROM public.saas_organization_trials WHERE organization_id = $1', [ORG_ID]);
  const restored = await resolveCabinetAs(connection, ORG_ID);
  const afterRenewal = await connection.query(
    'SELECT payload FROM public.cabinet_payload WHERE organization_id = $1',
    [ORG_ID],
  );
  if (restored.state !== 'full_access') fail(`renewal must restore cabinet full_access, got ${restored.state}`);
  if (beforeRenewal.rows[0]?.payload !== afterRenewal.rows[0]?.payload) {
    fail('cabinet block or renewal changed stored organization data');
  }
}

/**
 * Proof 7 / §5a item 7.0: НЕОПЛАТА двигает лестницу. An organization with an ASSIGNED tariff and no
 * trial at all walks all three rungs from the end of its PAID period, by the numbers in the tariff.
 *
 * This is the case that did nothing before 31.07: the only anchor was `trial.ends_at`, and the
 * assigned-tariff branch returned full access forever no matter how the owner configured the ladder.
 */
async function provePaidPeriodDrivesTheLadder(connection) {
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: { courses: MECHANIC_POLICY },
  });

  // Период оплачен и не истёк — полный доступ. It must NOT come from the old "assigned tariff"
  // branch: the same organization goes on to degrade below without anything else changing.
  await setPaidPeriod(connection, { endsAtIntervalFromNow: '1 day' });
  const paid = await resolveAs(connection, ORG_ID, 'courses');
  if (paid.state !== 'full_access') {
    fail(`inside a paid period expected full_access, got ${paid.state}`);
  }

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '-1 day' });
  const inGrace = await resolveAs(connection, ORG_ID, 'courses');
  if (inGrace.state !== 'grace') {
    fail(`1 day after an unpaid period (5-day grace) expected grace, got ${inGrace.state}`);
  }
  if (inGrace.mutation_allowed !== true) fail('grace after non-payment must still allow mutation');
  // The door must say WHICH period lapsed, or «условие: ошибка оплаты» has nothing real to follow.
  if (inGrace.warning?.periodSource !== 'paid_period') {
    fail(`expected periodSource paid_period, got ${JSON.stringify(inGrace.warning)}`);
  }

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '-6 days' });
  const inReadOnly = await resolveAs(connection, ORG_ID, 'courses');
  if (inReadOnly.state !== 'read_only') {
    fail(`6 days unpaid (5-day grace + 3-day read-only) expected read_only, got ${inReadOnly.state}`);
  }
  if (inReadOnly.mutation_allowed !== false) fail('read_only after non-payment must refuse mutation');

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '-10 days' });
  const atTerminal = await resolveAs(connection, ORG_ID, 'courses');
  if (atTerminal.state !== 'read_only') {
    fail(`10 days unpaid (past 5+3) expected terminalState read_only, got ${atTerminal.state}`);
  }

  // Конечное состояние — тоже данные, и на денежном якоре тоже.
  await setPolicies(connection, {
    systemAccessPolicy: null,
    mechanicAccessPolicies: { courses: { ...MECHANIC_POLICY, terminalState: 'disabled' } },
  });
  const disabledTerminal = await resolveAs(connection, ORG_ID, 'courses');
  if (disabledTerminal.state !== 'disabled') {
    fail(`terminalState from the tariff row must apply to the money anchor too, got ${disabledTerminal.state}`);
  }
}

/** Proof 8 / §5a item 7.0: the CABINET door sees non-payment as well — both doors, not one. */
async function provePaidPeriodDrivesTheCabinet(connection) {
  await clearPolicyHistory(connection);
  await setPolicies(connection, {
    systemAccessPolicy: {
      graceDays: 5,
      readOnlyDays: 3,
      notifications: [OWNER_NOTIFICATION],
      terminalState: 'disabled',
    },
    mechanicAccessPolicies: {},
  });

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '1 day' });
  const paid = await resolveCabinetAs(connection, ORG_ID);
  if (paid.state !== 'full_access') fail(`cabinet inside a paid period expected full_access, got ${paid.state}`);

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '-1 day' });
  const grace = await resolveCabinetAs(connection, ORG_ID);
  if (grace.state !== 'grace' || grace.warning?.periodSource !== 'paid_period') {
    fail(`cabinet grace after non-payment expected grace/paid_period, got ${JSON.stringify(grace)}`);
  }

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '-6 days' });
  const readOnly = await resolveCabinetAs(connection, ORG_ID);
  if (readOnly.state !== 'read_only') fail(`cabinet read-only after non-payment, got ${readOnly.state}`);

  await setPaidPeriod(connection, { endsAtIntervalFromNow: '-10 days' });
  const blocked = await resolveCabinetAs(connection, ORG_ID);
  if (blocked.state !== 'disabled') fail(`cabinet terminal after non-payment, got ${blocked.state}`);

  // An organization with an ASSIGNED tariff and NO period at all (rows the backfill could not date,
  // or a manual assignment that never opened a period) must stay open: killing the eternal-full-
  // access branch must not take out the only case that legitimately has nothing to measure from.
  // #1069 §2.13 removed the compatibility state this used to be described by — ORG_ID still has its
  // TARIFF_ID assigned throughout this proof, which is what keeps it open now, not a raw state.
  await clearPaidPeriod(connection);
  const noPeriod = await resolveCabinetAs(connection, ORG_ID);
  if (noPeriod.state !== 'full_access') {
    fail(`an organization with no period at all must keep access, got ${noPeriod.state}`);
  }
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
    label: 'retroactive block restored — a live shortening ejects an in-progress mechanic stage',
    proof: async (connection) => {
      await clearPolicyHistory(connection);
      await setPolicies(connection, {
        systemAccessPolicy: null,
        mechanicAccessPolicies: {
          courses: { graceDays: 2, readOnlyDays: 5, notifications: [], terminalState: 'disabled' },
        },
      });
      await setDegradationAnchor(connection, { endsAtIntervalFromNow: '-3 days' });
      await editPolicies(connection, {
        systemAccessPolicy: null,
        mechanicAccessPolicies: {
          courses: { graceDays: 0, readOnlyDays: 0, notifications: [], terminalState: 'disabled' },
        },
      });
      const access = await resolveAs(connection, ORG_ID, 'courses');
      if (access.state !== 'read_only') {
        fail(`prospective shortening expected read_only, got ${access.state}`);
      }
    },
    breakSource: (source) =>
      source.replaceAll(
        'previous_policy ->>',
        "(CASE WHEN previous_policy IS NOT NULL THEN '{}'::jsonb ELSE '{}'::jsonb END) ->>",
      ),
  },
  {
    label: 'critical mechanic hardcode removed — patient_card would degrade like any other mechanic',
    proof: proveCriticalMechanicNeverDegrades,
    breakSource: (source) =>
      source.replaceAll(
        `p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries'])`,
        `false`,
      ),
  },
  {
    label: 'grace window arithmetic removed — degraded orgs jump straight to terminal state',
    proof: proveTransitionsByDate,
    breakSource: (source) =>
      source.replace(
        `WHEN degradation_started_at IS NOT NULL
          AND v_now < included.grace_ends_at
          THEN 'grace'`,
        `WHEN false THEN 'grace'`,
      ),
  },
  {
    // §5a item 7.0 — the exact defect this work removes: with only the trial anchor, an assigned
    // tariff never degrades, however the owner configured the ladder.
    label: 'paid-period anchor removed — non-payment stops moving the ladder',
    proof: provePaidPeriodDrivesTheLadder,
    breakSource: (source) =>
      source.replace(
        `COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,`,
        `trial.ends_at AS degradation_started_at,`,
      ),
  },
  {
    // The other half of the same defect: the branch that handed out full access forever.
    label: 'eternal full-access branch restored — an assigned tariff never degrades',
    proof: provePaidPeriodDrivesTheLadder,
    breakSource: (source) =>
      source.replace(
        `WHEN degradation_started_at IS NULL AND lifecycle = 'active' THEN 'full_access'`,
        `WHEN lifecycle = 'active' THEN 'full_access'`,
      ),
  },
  {
    label: 'an agent-added mechanic exclusion bypasses the ladder',
    proof: proveNoAgentMechanicExclusions,
    breakSource: (source) => {
      const target = configurableMechanics[0]?.mechanic;
      if (!target) return source;
      return source.replace(
        `WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'full_access'`,
        `WHEN p_mechanic = '${target}' THEN 'full_access'\n        WHEN p_mechanic = ANY (ARRAY['patient_card', 'patient_app', 'patient_diaries']) THEN 'full_access'`,
      );
    },
  },
];

const CABINET_REGRESSIONS = [
  {
    label: 'cabinet terminal block removed',
    proof: proveCabinetTransitionsAndDataRestoration,
    breakSource: (source) => source.replace(
      `WHEN degradation_started_at IS NOT NULL THEN policy ->> 'terminalState'`,
      `WHEN degradation_started_at IS NOT NULL THEN 'full_access'`,
    ),
  },
  {
    // §5a item 7.0, cabinet half: without the money anchor the cabinet door never notices non-payment.
    label: 'cabinet paid-period anchor removed — non-payment never closes the cabinet',
    proof: provePaidPeriodDrivesTheCabinet,
    breakSource: (source) =>
      source.replace(
        `COALESCE(trial.ends_at, paid_period.period_ends_at) AS degradation_started_at,`,
        `trial.ends_at AS degradation_started_at,`,
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
  for (const [index, regression] of CABINET_REGRESSIONS.entries()) {
    const brokenSource = regression.breakSource(cabinetFunctionSource);
    if (brokenSource === cabinetFunctionSource) {
      fail(`self-test "${regression.label}" did not find its target text to break — proof text stale`);
    }
    const regressionDb = `bcb_access_ladder_${stamp}_c${index}`;
    await installInto(regressionDb, doorFunctionSource, brokenSource);
    let thrownMessage = '';
    try {
      await withDb(regressionDb, (connection) => regression.proof(connection));
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
    if (!thrownMessage) {
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
    await proveLivePolicyChangesAreProspective(connection);
    console.log('  proof OK: live policy extension and shortening preserve elapsed ladder progress (§5a 2.9/2.10)');
    await proveMechanicOverridesSystem(connection);
    console.log('  proof OK: mechanic-level policy overrides system-level policy');
    await proveCriticalMechanicNeverDegrades(connection);
    console.log('  proof OK: critical (никогда-class) mechanic never degrades');
    await proveNoAgentMechanicExclusions(connection);
    console.log('  proof OK: every tariff mechanic follows the ladder; only owner-defined critical class stays outside it');
    await proveCabinetTransitionsAndDataRestoration(connection);
    console.log('  proof OK: cabinet full/grace/read-only/block stages preserve data and renewal restores access');
    await provePaidPeriodDrivesTheLadder(connection);
    console.log('  proof OK: an ASSIGNED tariff with an unpaid period walks all three rungs (§5a 7.0)');
    await provePaidPeriodDrivesTheCabinet(connection);
    console.log('  proof OK: the cabinet door sees non-payment too, and no-period organizations stay open');
  });

  await runRegressionSelfTests();

  console.log(
    'Access ladder transitions proof: OK — dates, data-driven policy, mechanic-over-system ' +
      'precedence, cabinet restoration, no agent mechanic exclusions, and all regression self-tests went red as designed.',
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
