#!/usr/bin/env node
/**
 * U3S specialist signup/provisioning/binding smoke.
 *
 * This proof never connects to DEV, TEST, or PROD. It starts a private PostgreSQL cluster under
 * /tmp, installs the canonical migrations/overlays needed by the U3S contract, exercises the
 * canonical `app.provision_specialist_owner(uuid)` function through a locked app_patient
 * principal, and delegates specialist binding to the production pgOrganizationProvisioning port.
 *
 * Covered properties:
 *   1. rollout-disabled source guards remain before signup side effects;
 *   2. provisioning creates exactly one organization + owner membership and no specialist;
 *   3. replay and concurrent confirmation converge on the same receipt;
 *   4. a foreign challenge UUID is not authority and a pre-existing active membership prevents a
 *      second organization;
 *   5. the authorized first-run binding is exact-org and idempotent and creates one specialist;
 *   6. every scratch role, database, and private cluster is removed on exit/signals.
 *
 * `--static-only` runs source/contract guards without starting PostgreSQL.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const pgBinDir = '/usr/lib/postgresql/16/bin';

const requireFromWebapp = createRequire(path.join(repoRoot, 'apps/webapp/package.json'));
const { Client } = requireFromWebapp('pg');

const paths = {
  bindingHelper: path.join(repoRoot, 'apps/webapp/scripts/u3s-current-contract-binding-smoke.ts'),
  confirmRoute: path.join(
    repoRoot,
    'apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts',
  ),
  migration0176: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0176_specialist_signup_intents.sql',
  ),
  migration0182: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0182_reference_catalog_snapshots.sql',
  ),
  migration0183: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0183_reference_catalog_snapshot_receipts.sql',
  ),
  migration0184: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0184_reference_catalog_org_insert_hook.sql',
  ),
  migration0215: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0215_staff_security_profiles.sql',
  ),
  ownerProvisioningOverlay: path.join(
    repoRoot,
    'deploy/postgres/specialist-owner-provisioning-rls.sql',
  ),
  p2bOverlay: path.join(repoRoot, 'deploy/postgres/p2-b-protected-principal-context.sql'),
  provisioningRepo: path.join(
    repoRoot,
    'apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts',
  ),
  registry: path.join(repoRoot, 'apps/webapp/src/modules/system-settings/registry.ts'),
  rollout: path.join(repoRoot, 'apps/webapp/src/modules/auth/specialistSignupRollout.ts'),
  runtimeConfig: path.join(repoRoot, 'apps/webapp/src/modules/system-settings/runtimeConfig.ts'),
  startRoute: path.join(repoRoot, 'apps/webapp/src/app/api/auth/specialist-signup/start/route.ts'),
};

const suffix = `p${process.pid}_${randomBytes(4).toString('hex')}`.toLowerCase();
const dbName = `bcb_saas_u3s_current_contract_scratch_${suffix}`;
const ownerRole = `bcb_saas_u3s_owner_scratch_${suffix}`;
const runtimeRole = `bcb_saas_u3s_runtime_scratch_${suffix}`;
const runtimePassword = randomBytes(32).toString('base64url');
const signingSecret = randomBytes(32).toString('hex');
const clusterRoot = `/tmp/${dbName}_pg`;
const clusterData = path.join(clusterRoot, 'data');
const clusterSocket = path.join(clusterRoot, 'socket');
const clusterPort = String(56000 + (process.pid % 5000));

const users = {
  first: {
    userId: '31000000-0000-4000-8000-000000000001',
    challengeId: '31000000-0000-4000-8000-000000000011',
    email: 'owner-one@example.invalid',
    organizationTitle: 'U3S Scratch Cabinet One',
    fullName: 'Owner One',
  },
  concurrent: {
    userId: '32000000-0000-4000-8000-000000000002',
    challengeId: '32000000-0000-4000-8000-000000000012',
    email: 'owner-two@example.invalid',
    organizationTitle: 'U3S Scratch Cabinet Two',
    fullName: 'Owner Two',
  },
  existingMember: {
    userId: '33000000-0000-4000-8000-000000000003',
    challengeId: '33000000-0000-4000-8000-000000000013',
    email: 'existing-owner@example.invalid',
    organizationTitle: 'U3S Must Not Be Created',
    fullName: 'Existing Owner',
    organizationId: '33000000-0000-4000-8000-000000000033',
  },
};

let clusterStarted = false;
let cleanupStarted = false;

for (const name of [dbName, ownerRole, runtimeRole]) assertSafeScratchName(name);
assertNoUnsafeParentDbHints();
assertStaticSourceGuards();

if (process.argv.includes('--static-only')) {
  console.log('smoke-phase3-specialist-signup-provisioning: static guards OK');
  process.exit(0);
}

installSignalCleanup();

try {
  buildDbPrincipalPackage();
  startPrivateCluster();
  createScratchRolesAndDatabase();
  installCanonicalSchema();
  installScratchRuntimeWall();
  await runCurrentContractProof();
  console.log(`smoke-phase3-specialist-signup-provisioning: OK (${dbName})`);
} finally {
  cleanupScratch();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSafeScratchName(name) {
  if (!/^bcb_saas_[a-z0-9_]+_scratch_[a-z0-9_]+$/.test(name)) {
    throw new Error(`refusing unsafe scratch resource name: ${name}`);
  }
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(name)) {
    throw new Error(`refusing environment-shaped scratch resource name: ${name}`);
  }
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

function assertNoUnsafeParentDbHints() {
  const candidates = [
    process.env.DATABASE_URL
      ? ['DATABASE_URL', databaseNameFromUrl(process.env.DATABASE_URL)]
      : null,
    process.env.PGDATABASE ? ['PGDATABASE', process.env.PGDATABASE] : null,
  ].filter(Boolean);
  for (const [source, name] of candidates) {
    if (!name || /(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/i.test(name)) {
      throw new Error(`${source} points at an unsafe parent database hint; refusing scratch smoke`);
    }
  }
}

function sanitizedChildEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_STAFF',
    'DATABASE_URL_NONSTAFF',
    'PGDATABASE',
    'PGHOST',
    'PGPASSWORD',
    'PGPASSFILE',
    'PGPORT',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGUSER',
  ]) {
    delete env[key];
  }
  return { ...env, ...extra };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: sanitizedChildEnv(options.env),
    input: options.input,
    stdio: options.input == null ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  if (result.error)
    throw new Error(`${options.label ?? command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${options.label ?? `${command} ${args.join(' ')}`} failed with ${result.status}`,
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function safeRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: sanitizedChildEnv(options.env),
    input: options.input,
    stdio: options.input == null ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildDbPrincipalPackage() {
  for (const packagePath of ['packages/db-principal', 'packages/operator-db-schema']) {
    run('pnpm', ['--dir', packagePath, 'run', 'build'], {
      label: `build canonical ${packagePath} package`,
    });
  }
}

function startPrivateCluster() {
  run('mkdir', ['-p', clusterData, clusterSocket]);
  run(path.join(pgBinDir, 'initdb'), ['-D', clusterData, '-A', 'trust', '--no-locale']);
  run(path.join(pgBinDir, 'pg_ctl'), [
    '-D',
    clusterData,
    '-o',
    `-k ${clusterSocket} -p ${clusterPort} -c listen_addresses=''`,
    '-w',
    'start',
  ]);
  clusterStarted = true;
}

function postgresArgs(database = dbName) {
  return ['-h', clusterSocket, '-p', clusterPort, '-v', 'ON_ERROR_STOP=1', '-d', database];
}

function psql(sql, { database = dbName, label = 'scratch psql' } = {}) {
  run(path.join(pgBinDir, 'psql'), postgresArgs(database), { input: sql, label });
}

function psqlFile(filePath, { prefix = '', suffix = '', label } = {}) {
  const sql = `${prefix}\n${readFileSync(filePath, 'utf8')}\n${suffix}`;
  psql(sql, { label: label ?? `apply ${path.relative(repoRoot, filePath)}` });
}

function createScratchRolesAndDatabase() {
  psql(
    [
      `CREATE ROLE ${quoteIdent(ownerRole)} NOLOGIN NOBYPASSRLS;`,
      'CREATE ROLE app_staff NOLOGIN NOBYPASSRLS;',
      'CREATE ROLE app_patient NOLOGIN NOBYPASSRLS;',
      `CREATE ROLE ${quoteIdent(runtimeRole)} LOGIN NOINHERIT NOBYPASSRLS PASSWORD ${quoteLiteral(runtimePassword)};`,
      `GRANT app_staff, app_patient TO ${quoteIdent(runtimeRole)};`,
    ].join('\n'),
    { database: 'postgres', label: 'create disposable U3S roles' },
  );
  run(path.join(pgBinDir, 'createdb'), [
    '-h',
    clusterSocket,
    '-p',
    clusterPort,
    '-O',
    ownerRole,
    dbName,
  ]);
}

function installCanonicalSchema() {
  psqlFile(paths.p2bOverlay, {
    prefix: [
      `\\set p2_b_owner_role ${quoteLiteral(ownerRole)}`,
      "\\set p2_b_staff_role 'app_staff'",
      "\\set p2_b_patient_role 'app_patient'",
      `\\set p2_b_signing_secret ${quoteLiteral(signingSecret)}`,
    ].join('\n'),
    label: 'apply canonical P2-B protected principal context',
  });

  psql(baseSchemaSql(), { label: 'install minimal U3S base schema' });
  for (const migrationPath of [
    paths.migration0176,
    paths.migration0182,
    paths.migration0183,
    paths.migration0184,
    paths.migration0215,
  ]) {
    psqlFile(migrationPath, {
      prefix: `BEGIN;\nSET ROLE ${quoteIdent(ownerRole)};`,
      suffix: 'COMMIT;',
      label: `apply canonical ${path.basename(migrationPath)}`,
    });
  }
  psqlFile(paths.ownerProvisioningOverlay, {
    label: 'apply canonical specialist owner provisioning overlay',
  });
}

function baseSchemaSql() {
  return `
SET ROLE ${quoteIdent(ownerRole)};
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'client',
  updated_at timestamptz NOT NULL DEFAULT now(),
  merged_into_id uuid,
  email_verified_at timestamptz
);
CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.be_specialists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.be_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = ANY (ARRAY['owner','admin','doctor','assistant']::text[])),
  specialist_id uuid REFERENCES public.be_specialists(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active','invited','disabled']::text[])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_be_organization_members_org_user UNIQUE (organization_id, platform_user_id)
);
CREATE TABLE public.org_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_enrollments_org_user UNIQUE (organization_id, platform_user_id)
);
CREATE TABLE public.reference_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  is_user_extensible boolean NOT NULL DEFAULT false,
  owner_id uuid,
  tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.reference_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  category_id uuid NOT NULL REFERENCES public.reference_categories(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT reference_items_category_id_code_key UNIQUE (category_id, code)
);
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_id uuid REFERENCES public.platform_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_id text,
  conflict_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ok',
  repeat_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
RESET ROLE;
`;
}

function installScratchRuntimeWall() {
  psql(`
GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(runtimeRole)};
GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(ownerRole)};
GRANT USAGE ON SCHEMA public, app, app_ext TO app_staff, app_patient;
GRANT SELECT, INSERT, UPDATE ON public.be_organization_members TO app_staff;
GRANT SELECT, INSERT, UPDATE ON public.be_specialists TO app_staff;
GRANT SELECT, INSERT ON public.admin_audit_log TO app_staff;

ALTER TABLE public.be_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY u3s_staff_exact_org_members ON public.be_organization_members
  FOR ALL TO app_staff
  USING (app.is_staff() AND organization_id = app.current_org_id())
  WITH CHECK (app.is_staff() AND organization_id = app.current_org_id());
CREATE POLICY u3s_staff_exact_org_specialists ON public.be_specialists
  FOR ALL TO app_staff
  USING (app.is_staff() AND organization_id = app.current_org_id())
  WITH CHECK (app.is_staff() AND organization_id = app.current_org_id());
CREATE POLICY u3s_staff_exact_org_audit ON public.admin_audit_log
  FOR ALL TO app_staff
  USING (app.is_staff() AND organization_id = app.current_org_id())
  WITH CHECK (app.is_staff() AND organization_id = app.current_org_id());
`);
}

async function runCurrentContractProof() {
  seedFixtures();
  const principal = await loadDbPrincipalRuntime();
  const lockedOptions = principal.buildDbPrincipalApplyOptions({
    mode: 'locked',
    signingSecret,
    ttlMs: 120_000,
    nonce: () => `u3s_${randomUUID()}`,
  });

  const first = await provisionOnce(
    principal,
    lockedOptions,
    users.first.userId,
    users.first.challengeId,
  );
  assert(first.ok === true && !first.code, 'first provisioning must succeed');
  assert(
    first.organizationId && first.membershipId,
    'first provisioning must return org and membership',
  );
  assert(first.specialistId === null, 'organization provisioning must defer specialist binding');

  const replay = await provisionOnce(
    principal,
    lockedOptions,
    users.first.userId,
    users.first.challengeId,
  );
  assertSameReceipt(first, replay, 'sequential replay');

  const concurrent = await provisionConcurrently(
    principal,
    lockedOptions,
    users.concurrent.userId,
    users.concurrent.challengeId,
  );
  assertSameReceipt(concurrent[0], concurrent[1], 'concurrent confirmation');

  const foreign = await provisionOnce(
    principal,
    lockedOptions,
    users.first.userId,
    users.concurrent.challengeId,
  );
  assert(
    foreign.ok === false && foreign.code === 'specialist_signup_intent_not_found',
    'foreign challenge UUID must not authorize provisioning',
  );

  const beforeSecondOrgAttempt = Number(psqlScalar('SELECT count(*) FROM public.be_organizations'));
  const secondOrg = await provisionOnce(
    principal,
    lockedOptions,
    users.existingMember.userId,
    users.existingMember.challengeId,
  );
  assert(
    secondOrg.ok === false && secondOrg.code === 'specialist_signup_active_membership_exists',
    'an active membership must deny a second organization',
  );
  assert(
    Number(psqlScalar('SELECT count(*) FROM public.be_organizations')) === beforeSecondOrgAttempt,
    'second-organization denial must not create rows',
  );

  assertProvisioningState(users.first, first);
  assertProvisioningState(users.concurrent, concurrent[0]);
  runCanonicalBindingHelper(first, users.existingMember.organizationId);
  assertBindingState(users.first, first);
}

function seedFixtures() {
  const values = Object.values(users)
    .map(
      (user) =>
        `(${quoteLiteral(user.userId)}::uuid, ${quoteLiteral(user.fullName)}, 'client', now(), now())`,
    )
    .join(',\n');
  const intents = Object.values(users)
    .map(
      (user) =>
        `(${quoteLiteral(user.userId)}::uuid, ${quoteLiteral(user.challengeId)}::uuid, ${quoteLiteral(user.email)}, ${quoteLiteral(user.organizationTitle)}, ${quoteLiteral(user.fullName)})`,
    )
    .join(',\n');
  psql(`
SET ROLE ${quoteIdent(ownerRole)};
INSERT INTO public.platform_users (id, display_name, role, updated_at, email_verified_at) VALUES
${values};
INSERT INTO public.be_organizations (id, title)
VALUES (${quoteLiteral(users.existingMember.organizationId)}::uuid, 'Existing Organization');
INSERT INTO public.be_organization_members (organization_id, platform_user_id, role, status)
VALUES (
  ${quoteLiteral(users.existingMember.organizationId)}::uuid,
  ${quoteLiteral(users.existingMember.userId)}::uuid,
  'owner',
  'active'
);
INSERT INTO public.specialist_signup_intents (
  user_id, challenge_id, email_normalized, organization_title, specialist_full_name
) VALUES
${intents};
RESET ROLE;
`);
}

async function loadDbPrincipalRuntime() {
  const runtimePath = path.join(repoRoot, 'packages/db-principal/dist/index.js');
  return import(`${pathToFileURL(runtimePath).href}?u3s=${Date.now()}`);
}

function makeRuntimeClient() {
  return new Client({
    database: dbName,
    host: clusterSocket,
    password: runtimePassword,
    port: Number(clusterPort),
    ssl: false,
    user: runtimeRole,
  });
}

async function withRuntimeClient(fn) {
  const client = makeRuntimeClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function applyPatientPrincipal(principal, lockedOptions, client, userId) {
  await principal.runWithDbPatientPrincipal({ platformUserId: userId }, async () => {
    const applied = await principal.applyCurrentDbPrincipalToConnection(client, lockedOptions);
    assert(applied === true, 'locked patient principal must be applied');
  });
}

async function provisionOnce(principal, lockedOptions, userId, challengeId) {
  return withRuntimeClient(async (client) => {
    await applyPatientPrincipal(principal, lockedOptions, client, userId);
    try {
      return await queryProvision(client, challengeId);
    } finally {
      await principal.clearDbPrincipalFromConnection(client, lockedOptions);
    }
  });
}

async function provisionConcurrently(principal, lockedOptions, userId, challengeId) {
  const clientA = makeRuntimeClient();
  const clientB = makeRuntimeClient();
  let transactionOpen = false;
  await Promise.all([clientA.connect(), clientB.connect()]);
  try {
    await Promise.all([
      applyPatientPrincipal(principal, lockedOptions, clientA, userId),
      applyPatientPrincipal(principal, lockedOptions, clientB, userId),
    ]);
    await clientA.query('BEGIN');
    transactionOpen = true;
    const first = await queryProvision(clientA, challengeId);
    const secondPromise = queryProvision(clientB, challengeId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await clientA.query('COMMIT');
    transactionOpen = false;
    const second = await secondPromise;
    return [first, second];
  } finally {
    await Promise.allSettled([
      ...(transactionOpen ? [clientA.query('ROLLBACK')] : []),
      principal.clearDbPrincipalFromConnection(clientA, lockedOptions),
      principal.clearDbPrincipalFromConnection(clientB, lockedOptions),
    ]);
    await Promise.allSettled([clientA.end(), clientB.end()]);
  }
}

async function queryProvision(client, challengeId) {
  const result = await client.query(
    `SELECT ok, code, organization_id::text, specialist_id::text, membership_id::text
       FROM app.provision_specialist_owner($1::uuid)`,
    [challengeId],
  );
  const row = result.rows[0];
  assert(row, 'provisioning function must return one row');
  return {
    ok: row.ok,
    code: row.code,
    organizationId: row.organization_id,
    specialistId: row.specialist_id,
    membershipId: row.membership_id,
  };
}

function assertSameReceipt(left, right, label) {
  assert(left.ok === true && right.ok === true, `${label}: both calls must succeed`);
  assert(left.organizationId === right.organizationId, `${label}: organization must converge`);
  assert(left.membershipId === right.membershipId, `${label}: membership must converge`);
  assert(
    left.specialistId === null && right.specialistId === null,
    `${label}: binding stays deferred`,
  );
}

function assertProvisioningState(seed, receipt) {
  const row = JSON.parse(
    psqlScalar(`
SELECT json_build_object(
  'organizations', (SELECT count(*) FROM public.be_organizations WHERE id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'memberships', (SELECT count(*) FROM public.be_organization_members WHERE id = ${quoteLiteral(receipt.membershipId)}::uuid),
  'specialists', (SELECT count(*) FROM public.be_specialists WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'enrollments', (SELECT count(*) FROM public.org_enrollments WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'receipts', (SELECT count(*) FROM public.reference_catalog_snapshot_receipts WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'intent_status', (SELECT status FROM public.specialist_signup_intents WHERE challenge_id = ${quoteLiteral(seed.challengeId)}::uuid),
  'intent_specialist', (SELECT provisioned_specialist_id FROM public.specialist_signup_intents WHERE challenge_id = ${quoteLiteral(seed.challengeId)}::uuid)
)::text;
`),
  );
  assert(row.organizations === 1, 'provisioning must create exactly one organization');
  assert(row.memberships === 1, 'provisioning must create exactly one membership');
  assert(row.specialists === 0, 'provisioning must not create a specialist before binding');
  assert(row.enrollments === 0, 'owner provisioning must not create patient enrollment');
  assert(row.receipts === 1, 'organization must have one reference catalog receipt');
  assert(row.intent_status === 'provisioned', 'intent must be provisioned');
  assert(
    row.intent_specialist === null,
    'intent specialist receipt must remain null before binding',
  );
}

function runtimeDatabaseUrl() {
  const socketQuery = encodeURIComponent(clusterSocket);
  return `postgresql://${encodeURIComponent(runtimeRole)}:${encodeURIComponent(runtimePassword)}@localhost/${dbName}?host=${socketQuery}&port=${clusterPort}`;
}

function runCanonicalBindingHelper(receipt, otherOrganizationId) {
  run(
    'pnpm',
    ['--dir', 'apps/webapp', 'exec', 'tsx', 'scripts/u3s-current-contract-binding-smoke.ts'],
    {
      label: 'run canonical U3S specialist binding helper',
      env: {
        DATABASE_URL: runtimeDatabaseUrl(),
        DB_PRINCIPAL_CONTEXT_MODE: 'locked',
        DB_PRINCIPAL_SIGNING_SECRET: signingSecret,
        NODE_ENV: 'test',
        SESSION_COOKIE_SECRET: signingSecret,
        U3S_SMOKE_DB_NAME: dbName,
        U3S_SMOKE_ORGANIZATION_ID: receipt.organizationId,
        U3S_SMOKE_MEMBERSHIP_ID: receipt.membershipId,
        U3S_SMOKE_PLATFORM_USER_ID: users.first.userId,
        U3S_SMOKE_FOREIGN_PLATFORM_USER_ID: users.existingMember.userId,
        U3S_SMOKE_OTHER_ORGANIZATION_ID: otherOrganizationId,
        U3S_SMOKE_FULL_NAME: users.first.fullName,
      },
    },
  );
}

function assertBindingState(seed, receipt) {
  const state = JSON.parse(
    psqlScalar(`
SELECT json_build_object(
  'specialists', (SELECT count(*) FROM public.be_specialists WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'membership_specialist', (SELECT specialist_id IS NOT NULL FROM public.be_organization_members WHERE id = ${quoteLiteral(receipt.membershipId)}::uuid),
  'audit_events', (SELECT count(*) FROM public.admin_audit_log WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid AND action = 'specialist_self_binding_created'),
  'intent_specialist', (SELECT provisioned_specialist_id FROM public.specialist_signup_intents WHERE challenge_id = ${quoteLiteral(seed.challengeId)}::uuid)
)::text;
`),
  );
  assert(state.specialists === 1, 'binding must create exactly one specialist');
  assert(
    state.membership_specialist === true,
    'binding must attach the specialist to owner membership',
  );
  assert(state.audit_events === 1, 'idempotent binding must write exactly one audit event');
  assert(
    state.intent_specialist === null,
    'deferred binding must not rewrite the provisioning receipt',
  );
}

function psqlScalar(sql) {
  const result = spawnSync(
    path.join(pgBinDir, 'psql'),
    ['-h', clusterSocket, '-p', clusterPort, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', dbName],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: sanitizedChildEnv(),
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error('scratch scalar query failed');
  }
  return result.stdout.trim();
}

function assertStaticSourceGuards() {
  const source = Object.fromEntries(
    Object.entries(paths).map(([key, filePath]) => [key, readFileSync(filePath, 'utf8')]),
  );
  assert(
    source.rollout.includes('getPublicRuntimeBool("specialist_signup_enabled")') &&
      source.runtimeConfig.includes('specialist_signup_enabled: false'),
    'specialist signup must remain disabled by default',
  );
  assert(
    source.registry.includes(
      'specialist_signup_enabled: runtime("admin", "global", "public", "boolean", "false")',
    ),
    'rollout flag must stay DB-backed',
  );
  assertOrder(
    source.startRoute,
    [
      'const specialistSignupEnabled = await getSpecialistSignupEnabled();',
      'if (!specialistSignupEnabled) {',
      'registerPendingSpecialistVerification({',
      'startEmailChallenge(',
      'createSpecialistSignupIntent({',
    ],
    'signup start rollout order',
  );
  assertOrder(
    source.confirmRoute,
    [
      'const specialistSignupEnabled = await getSpecialistSignupEnabled();',
      'if (!specialistSignupEnabled) {',
      'findUserIdByEmailChallengeId(',
      'confirmEmailChallenge(',
      'provisionSpecialistOwner({',
    ],
    'signup confirmation rollout order',
  );
  assert(
    source.ownerProvisioningOverlay.includes(
      'v_platform_user_id := app.require_staff_security_self_user_id()',
    ),
    'canonical provisioning must derive the user from the signed self principal',
  );
  assert(
    !source.ownerProvisioningOverlay.includes('INSERT INTO public.be_specialists'),
    'canonical organization provisioning must not create a specialist',
  );
  assert(
    source.ownerProvisioningOverlay.includes("'specialist_signup_active_membership_exists'"),
    'canonical provisioning must deny a second active staff organization',
  );
  assert(
    source.provisioningRepo.includes('async ensureOwnBookableSpecialist') &&
      source.provisioningRepo.includes('specialist_self_binding_created'),
    'specialist binding must remain in the canonical provisioning repository',
  );
}

function assertOrder(source, snippets, label) {
  let cursor = -1;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet, cursor + 1);
    assert(index >= 0, `${label}: missing ${snippet}`);
    assert(index >= cursor, `${label}: out of order ${snippet}`);
    cursor = index;
  }
}

function installSignalCleanup() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      cleanupScratch();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
}

function cleanupScratch() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  if (clusterStarted) {
    safeRun(path.join(pgBinDir, 'pg_ctl'), ['-D', clusterData, '-m', 'fast', '-w', 'stop']);
  }
  if (clusterRoot.startsWith('/tmp/bcb_saas_u3s_current_contract_scratch_')) {
    safeRun('rm', ['-rf', clusterRoot]);
  }
}
