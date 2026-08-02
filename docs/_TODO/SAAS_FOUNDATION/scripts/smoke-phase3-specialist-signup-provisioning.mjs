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
 *   2. two registrations racing for one slug are decided by the global unique index: one wins and
 *      the other gets slug_unavailable without a leftover organization;
 *   3. provisioning creates exactly one organization + owner membership + bound specialist;
 *   4. replay and concurrent confirmation converge on the same receipt;
 *   5. a foreign challenge UUID is not authority and a pre-existing active membership prevents a
 *      second organization;
 *   6. the authorized first-run binding is exact-org and idempotent and creates one specialist;
 *   7. the configured C5A trial is assigned in the same provisioning transaction and replayed
 *      confirmations do not duplicate it;
 *   8. a signed staff principal reads only its exact organization/trial/overrides while retaining
 *      global tariff visibility and no commercial DML;
 *   9. every scratch role, database, and private cluster is removed on exit/signals.
 *
 * `--static-only` runs source/contract guards without starting PostgreSQL.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const pgBinDir = '/usr/lib/postgresql/16/bin';

const requireFromWebapp = createRequire(path.join(repoRoot, 'apps/webapp/package.json'));
let Client;

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
  migration0180: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0180_store_entitlements.sql',
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
  migration0203: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0203_clinic_public_directory_slug.sql',
  ),
  migration0215: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0215_staff_security_profiles.sql',
  ),
  migration0218: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0218_u6b_organization_slug_claims.sql',
  ),
  migration0212: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0212_clinic_team_seat_limit.sql',
  ),
  migration0213: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0213_clinic_team_seat_nonnegative.sql',
  ),
  migration0225: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0225_saas_tariff_quotas_trial.sql',
  ),
  migration0257: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0257_specialist_signup_slug_reservation.sql',
  ),
  // 0268 -> 0267 and 0270 -> 0269: the reserved 0267 work needed no migration, so both unchanged
  // contracts move down when the numbering gap closes.
  migration0267: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0267_platform_organization_members_directory.sql',
  ),
  migration0269: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0269_remove_specialist_signup_slug_reservation.sql',
  ),
  migration0289: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0289_saas_registration_tariff_policy_local.sql',
  ),
  migration0291: path.join(
    repoRoot,
    'apps/webapp/db/drizzle-migrations/0291_saas_registration_tariff_policy_walls_local.sql',
  ),
  c5aPlatformOperations: path.join(repoRoot, 'deploy/postgres/c5a-platform-operations-runtime.sql'),
  prodDeploy: path.join(repoRoot, 'deploy/host/deploy-prod.sh'),
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
const appOwnerRole = 'app_owner';
const platformSettingsRole = 'app_platform_settings';
const runtimePassword = randomBytes(32).toString('base64url');
const signingSecret = randomBytes(32).toString('hex');
const clusterRoot = `/tmp/${dbName}_pg`;
const clusterData = path.join(clusterRoot, 'data');
const clusterSocket = path.join(clusterRoot, 'socket');
const clusterPort = String(56000 + (process.pid % 5000));
const trialTariffId = '30000000-0000-4000-8000-000000000001';
const registrationPolicyRaceTariffId = '30000000-0000-4000-8000-000000000002';

const users = {
  first: {
    userId: '31000000-0000-4000-8000-000000000001',
    intentId: '31000000-0000-4000-8000-000000000021',
    challengeId: '31000000-0000-4000-8000-000000000011',
    email: 'owner-one@example.invalid',
    organizationTitle: 'U3S Scratch Cabinet One',
    organizationSlug: 'u3s-scratch-cabinet-one',
    fullName: 'Owner One',
  },
  concurrent: {
    userId: '32000000-0000-4000-8000-000000000002',
    intentId: '32000000-0000-4000-8000-000000000022',
    challengeId: '32000000-0000-4000-8000-000000000012',
    email: 'owner-two@example.invalid',
    organizationTitle: 'U3S Scratch Cabinet Two',
    organizationSlug: 'u3s-scratch-cabinet-two',
    fullName: 'Owner Two',
  },
  slugRaceLoser: {
    userId: '34000000-0000-4000-8000-000000000004',
    intentId: '34000000-0000-4000-8000-000000000024',
    challengeId: '34000000-0000-4000-8000-000000000014',
    email: 'owner-slug-race@example.invalid',
    organizationTitle: 'U3S Scratch Losing Cabinet',
    organizationSlug: 'u3s-scratch-cabinet-one',
    fullName: 'Owner Slug Race',
  },
  existingMember: {
    userId: '33000000-0000-4000-8000-000000000003',
    intentId: '33000000-0000-4000-8000-000000000023',
    challengeId: '33000000-0000-4000-8000-000000000013',
    email: 'existing-owner@example.invalid',
    organizationTitle: 'U3S Must Not Be Created',
    organizationSlug: 'u3s-must-not-be-created',
    fullName: 'Existing Owner',
    organizationId: '33000000-0000-4000-8000-000000000033',
  },
  registrationNull: {
    userId: '36000000-0000-4000-8000-000000000006',
    intentId: '36000000-0000-4000-8000-000000000026',
    challengeId: '36000000-0000-4000-8000-000000000016',
    email: 'registration-null@example.invalid',
    organizationTitle: 'Registration Null Policy',
    organizationSlug: 'registration-null-policy',
    fullName: 'Registration Null',
  },
  registrationBroken: {
    userId: '37000000-0000-4000-8000-000000000007',
    intentId: '37000000-0000-4000-8000-000000000027',
    challengeId: '37000000-0000-4000-8000-000000000017',
    email: 'registration-broken@example.invalid',
    organizationTitle: 'Registration Broken Policy',
    organizationSlug: 'registration-broken-policy',
    fullName: 'Registration Broken',
  },
};

let clusterStarted = false;
let cleanupStarted = false;

if (process.argv[2] === '--registration-policy-race-worker') {
  await runRegistrationPolicyRaceWorker(process.argv[3]);
  process.exit(0);
}

for (const name of [dbName, ownerRole, runtimeRole]) assertSafeScratchName(name);
assertNoUnsafeParentDbHints();
assertStaticSourceGuards();

if (process.argv.includes('--static-only')) {
  console.log('smoke-phase3-specialist-signup-provisioning: static guards OK');
  process.exit(0);
}

({ Client } = requireFromWebapp('pg'));
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
      `CREATE ROLE ${quoteIdent(appOwnerRole)} NOLOGIN BYPASSRLS;`,
      `CREATE ROLE ${quoteIdent(platformSettingsRole)} NOLOGIN NOINHERIT NOBYPASSRLS;`,
      'CREATE ROLE app_staff NOLOGIN NOBYPASSRLS;',
      'CREATE ROLE app_patient NOLOGIN NOBYPASSRLS;',
      `CREATE ROLE ${quoteIdent(runtimeRole)} LOGIN NOINHERIT NOBYPASSRLS PASSWORD ${quoteLiteral(runtimePassword)};`,
      `GRANT app_staff, app_patient, ${quoteIdent(platformSettingsRole)} TO ${quoteIdent(runtimeRole)};`,
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
  psql(`GRANT CREATE ON SCHEMA public TO ${quoteIdent(appOwnerRole)};`, {
    label: 'grant disposable schema ownership capability to canonical app owner',
  });
}

function installCanonicalSchema() {
  psqlFile(paths.p2bOverlay, {
    prefix: [
      `\\set p2_b_owner_role ${quoteLiteral(appOwnerRole)}`,
      "\\set p2_b_staff_role 'app_staff'",
      "\\set p2_b_patient_role 'app_patient'",
      `\\set p2_b_signing_secret ${quoteLiteral(signingSecret)}`,
    ].join('\n'),
    label: 'apply canonical P2-B protected principal context',
  });

  psql(baseSchemaSql(), { label: 'install minimal U3S base schema' });
  for (const migrationPath of [
    paths.migration0176,
    paths.migration0180,
    paths.migration0182,
    paths.migration0183,
    paths.migration0184,
    paths.migration0203,
    paths.migration0212,
    paths.migration0213,
    paths.migration0215,
    paths.migration0218,
    paths.migration0225,
    paths.migration0257,
    paths.migration0267,
    paths.migration0269,
    paths.migration0289,
    paths.migration0291,
  ]) {
    psqlFile(migrationPath, {
      prefix: `BEGIN;\nSET ROLE ${quoteIdent(appOwnerRole)};`,
      suffix: 'COMMIT;',
      label: `apply canonical ${path.basename(migrationPath)}`,
    });
  }
  // The existing U3S disposable baseline stops at the registration-policy migrations; load the
  // current repository port against the four later tariff-shape columns it selects.
  psql(`
ALTER TABLE public.saas_tariffs
  ADD COLUMN IF NOT EXISTS system_access_policy jsonb,
  ADD COLUMN IF NOT EXISTS mechanic_access_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS downgrade_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS additional_seat_price_minor integer;
`, { label: 'complete disposable tariff shape for the registration policy port race' });
  psqlFile(paths.ownerProvisioningOverlay, {
    label: 'apply canonical specialist owner provisioning overlay',
  });
  psqlFile(paths.c5aPlatformOperations, {
    label: 'apply canonical C5A platform operations capability',
  });
}

function baseSchemaSql() {
  return `
SET ROLE ${quoteIdent(appOwnerRole)};
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
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE
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
-- Added 2026-07-26: stub relations for the six-table read-only booking-configuration surface
-- deploy/postgres/c5a-platform-operations-runtime.sql grants/policies for app_platform_settings
-- (commit 2ed89349d, "the platform role could not read booking configuration"). Nothing in this
-- smoke script queries their columns -- the overlay only GRANTs the whole table and installs a
-- bare USING (true) SELECT policy -- so an id + organization_id stub is enough for those
-- statements to apply cleanly against this synthetic schema. be_specialists already exists above.
CREATE TABLE public.be_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE
);
CREATE TABLE public.be_clinic_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE
);
CREATE TABLE public.be_specialist_service_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE
);
CREATE TABLE public.be_service_location_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE
);
CREATE TABLE public.be_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE
);
RESET ROLE;
`;
}

function installScratchRuntimeWall() {
  psql(`
GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(runtimeRole)};
GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(appOwnerRole)};
GRANT USAGE ON SCHEMA app TO ${quoteIdent(platformSettingsRole)};
GRANT USAGE ON SCHEMA public, app, app_ext TO app_staff, app_patient;
GRANT SELECT, INSERT, UPDATE ON public.be_organization_members TO app_staff;
GRANT SELECT, INSERT, UPDATE ON public.be_specialists TO app_staff;
GRANT SELECT ON public.org_enrollments TO app_staff;
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

  const [first, slugRaceLoser] = await provisionSlugRace(
    principal,
    lockedOptions,
    users.first,
    users.slugRaceLoser,
  );
  assert(first.ok === true && !first.code, 'first provisioning must succeed');
  assert(
    first.organizationId && first.membershipId,
    'first provisioning must return org and membership',
  );
  // Superseded 2026-07-26 (was: first.specialistId === null, 'organization provisioning must defer
  // specialist binding'). commit feb80b75d moved specialist creation into the same transaction as
  // organization/membership provisioning (the owner-reported dead-workspace fix: a membership left
  // with specialist_id NULL made resolveLaunchCapabilities() withhold clinical.workspace forever).
  assert(
    typeof first.specialistId === 'string' && first.specialistId.length > 0,
    'organization provisioning must bind the owner specialist in the same transaction',
  );
  assert(
    slugRaceLoser.ok === false && slugRaceLoser.code === 'slug_unavailable',
    'the registration that loses the global slug race must receive slug_unavailable',
  );
  assertSlugRaceLoserRolledBack();

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
  const beforeSecondOrgTrialCount = Number(
    psqlScalar('SELECT count(*) FROM public.saas_organization_trials'),
  );
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
  assert(
    Number(psqlScalar('SELECT count(*) FROM public.saas_organization_trials')) ===
      beforeSecondOrgTrialCount,
    'second-organization denial must not create a trial outside provisioning',
  );

  assertProvisioningState(users.first, first);
  assertProvisioningState(users.concurrent, concurrent[0]);
  if (!process.argv.includes('--skip-registration-policy-race')) {
    await assertRegistrationTariffPolicyWriteRace();
  }
  await assertRegistrationTariffPolicyContracts(principal, lockedOptions);
  await assertStaffCommercialReadWall(principal, lockedOptions, first, concurrent[0]);
  runCanonicalBindingHelper(first, users.existingMember.organizationId);
  assertBindingState(users.first, first);
}

async function runRegistrationPolicyRaceWorker(operation) {
  if (operation !== 'set' && operation !== 'archive') {
    throw new Error('registration policy race worker requires set or archive');
  }
  const tariffId = process.env.REGISTRATION_POLICY_RACE_TARIFF_ID;
  if (!tariffId) throw new Error('registration policy race worker requires REGISTRATION_POLICY_RACE_TARIFF_ID');
  const [{ createPgPlatformEntitlementsPort }, { runWithDbPlatformPrincipal }] = await Promise.all([
    import(
      pathToFileURL(
        path.join(repoRoot, 'apps/webapp/src/infra/repos/pgPlatformEntitlements.ts'),
      ).href,
    ),
    import(pathToFileURL(path.join(repoRoot, 'packages/db-principal/dist/index.js')).href),
  ]);
  const audit = { actorId: users.first.userId, reason: 'independent registration tariff race audit' };
  await runWithDbPlatformPrincipal(
    { platformUserId: users.first.userId, source: 'platform.operations:authenticated' },
    async () => {
      const port = createPgPlatformEntitlementsPort();
      if (operation === 'set') {
        await port.setRegistrationTariffPolicy({ tariffId }, audit);
      } else {
        await port.archiveTariff(tariffId, audit);
      }
    },
  );
}

function runRegistrationPolicyRaceWorkerProcess(operation) {
  const scriptPath = path.join(
    repoRoot,
    'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs',
  );
  const child = spawn(
    'pnpm',
    ['--dir', 'apps/webapp', 'exec', 'tsx', scriptPath, '--registration-policy-race-worker', operation],
    {
      cwd: repoRoot,
      env: sanitizedChildEnv({
        DATABASE_URL: runtimeDatabaseUrl(),
        DB_PRINCIPAL_CONTEXT_MODE: 'locked',
        DB_PRINCIPAL_SIGNING_SECRET: signingSecret,
        NODE_ENV: 'test',
        REGISTRATION_POLICY_RACE_TARIFF_ID: registrationPolicyRaceTariffId,
        SESSION_COOKIE_SECRET: signingSecret,
        USE_REAL_DATABASE: '1',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code === 0) return resolve(undefined);
      reject(new Error(`registration policy ${operation} worker failed (${code}): ${stdout}${stderr}`));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function settle(promise) {
  try {
    await promise;
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function waitForRegistrationPolicyWriter() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const waiting = Number(
      psqlScalar(`
SELECT count(*)
FROM pg_stat_activity
WHERE datname = ${quoteLiteral(dbName)}
  AND wait_event_type = 'Lock'
  AND query ILIKE '%saas_registration_tariff_policy%';
`),
    );
    if (waiting > 0) return;
    await delay(50);
  }
  throw new Error('registration policy set worker did not reach the forced policy-row interleaving');
}

async function assertRegistrationTariffPolicyWriteRace() {
  psql(`
SET ROLE ${quoteIdent(appOwnerRole)};
INSERT INTO public.saas_registration_tariff_policy (key, tariff_id)
VALUES ('global', NULL)
ON CONFLICT (key) DO UPDATE SET tariff_id = NULL, updated_at = now();
UPDATE public.saas_tariffs SET is_active = true WHERE id = ${quoteLiteral(registrationPolicyRaceTariffId)}::uuid;
RESET ROLE;
`);
  const lockClient = makeRuntimeClient();
  await lockClient.connect();
  try {
    await lockClient.query('BEGIN');
    await lockClient.query('SET ROLE app_platform_settings');
    await lockClient.query(
      "SELECT key FROM public.saas_registration_tariff_policy WHERE key = 'global' FOR UPDATE",
    );
    const setWorker = settle(runRegistrationPolicyRaceWorkerProcess('set'));
    await waitForRegistrationPolicyWriter();
    const archiveWorker = settle(runRegistrationPolicyRaceWorkerProcess('archive'));
    const archiveBeforeUnlock = await Promise.race([
      archiveWorker,
      delay(2_000).then(() => null),
    ]);
    await lockClient.query('COMMIT');
    const [setResult, archiveResult] = await Promise.all([setWorker, archiveWorker]);
    assert(
      setResult.ok || archiveResult.ok,
      'both concurrent registration policy operations failed instead of preserving one legal write',
    );
    if (archiveBeforeUnlock?.ok === false) {
      throw archiveBeforeUnlock.error;
    }
  } finally {
    await lockClient.query('ROLLBACK').catch(() => undefined);
    await lockClient.end();
  }
  const finalState = JSON.parse(
    psqlScalar(`
SELECT json_build_object(
  'policy_tariff_id', (SELECT tariff_id FROM public.saas_registration_tariff_policy WHERE key = 'global'),
  'tariff_is_active', (SELECT is_active FROM public.saas_tariffs WHERE id = ${quoteLiteral(registrationPolicyRaceTariffId)}::uuid)
)::text;
`),
  );
  assert(
    finalState.policy_tariff_id !== registrationPolicyRaceTariffId || finalState.tariff_is_active !== false,
    'concurrent registration policy set and tariff archive committed an inactive policy reference',
  );
}

async function assertRegistrationTariffPolicyContracts(principal, lockedOptions) {
  psql(`
SET ROLE ${quoteIdent(appOwnerRole)};
UPDATE public.saas_trial_policy SET is_active = false WHERE key = 'global';
INSERT INTO public.saas_registration_tariff_policy (key, tariff_id)
VALUES ('global', NULL)
ON CONFLICT (key) DO UPDATE SET tariff_id = EXCLUDED.tariff_id, updated_at = now();
RESET ROLE;
`);
  const nullPolicyReceipt = await provisionOnce(
    principal,
    lockedOptions,
    users.registrationNull.userId,
    users.registrationNull.challengeId,
  );
  assert(nullPolicyReceipt.ok === true, 'NULL registration tariff policy must allow provisioning');
  const nullPolicyState = JSON.parse(
    psqlScalar(`
SELECT json_build_object(
  'tariff_id', (SELECT tariff_id FROM public.be_organizations WHERE id = ${quoteLiteral(nullPolicyReceipt.organizationId)}::uuid),
  'trials', (SELECT count(*) FROM public.saas_organization_trials WHERE organization_id = ${quoteLiteral(nullPolicyReceipt.organizationId)}::uuid)
)::text;
`),
  );
  assert(nullPolicyState.tariff_id === null, 'NULL registration tariff policy must leave tariff selection to the clinic');
  assert(nullPolicyState.trials === 0, 'disabled trial plus NULL registration tariff policy must create no trial');

  psql(`
SET ROLE ${quoteIdent(appOwnerRole)};
UPDATE public.saas_registration_tariff_policy
SET tariff_id = ${quoteLiteral(trialTariffId)}::uuid, updated_at = now()
WHERE key = 'global';
UPDATE public.saas_tariffs SET is_active = false WHERE id = ${quoteLiteral(trialTariffId)}::uuid;
RESET ROLE;
`);
  try {
    await provisionOnce(
      principal,
      lockedOptions,
      users.registrationBroken.userId,
      users.registrationBroken.challengeId,
    );
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes('registration_tariff_policy_tariff_invalid'),
      'broken non-NULL registration tariff policy must fail with its stable error',
    );
    const rollbackState = JSON.parse(
      psqlScalar(`
SELECT json_build_object(
  'intent_status', (SELECT status FROM public.specialist_signup_intents WHERE id = ${quoteLiteral(users.registrationBroken.intentId)}::uuid),
  'organizations', (SELECT count(*) FROM public.be_organizations WHERE title = ${quoteLiteral(users.registrationBroken.organizationTitle)}),
  'memberships', (SELECT count(*) FROM public.be_organization_members WHERE platform_user_id = ${quoteLiteral(users.registrationBroken.userId)}::uuid)
)::text;
`),
    );
    assert(rollbackState.intent_status === 'pending', 'broken registration tariff policy must leave the signup intent pending');
    assert(rollbackState.organizations === 0, 'broken registration tariff policy must roll back the organization');
    assert(rollbackState.memberships === 0, 'broken registration tariff policy must roll back the membership');
    return;
  }
  throw new Error('broken non-NULL registration tariff policy unexpectedly provisioned an organization');
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
        `(${quoteLiteral(user.intentId)}::uuid, ${quoteLiteral(user.userId)}::uuid, ${quoteLiteral(user.challengeId)}::uuid, ${quoteLiteral(user.email)}, ${quoteLiteral(user.organizationTitle)}, ${quoteLiteral(user.organizationSlug)}, ${quoteLiteral(user.fullName)})`,
    )
    .join(',\n');
  psql(`
SET ROLE ${quoteIdent(appOwnerRole)};
INSERT INTO public.saas_tariffs (
  id, name, description, price_minor, currency, mechanics, billing_period, quotas, is_active
) VALUES (
  ${quoteLiteral(trialTariffId)}::uuid,
  'U3S Scratch Trial',
  'Disposable provisioning proof',
  NULL,
  NULL,
  '{"clients": true}'::jsonb,
  'month',
  '{}'::jsonb,
  true
), (
  ${quoteLiteral(registrationPolicyRaceTariffId)}::uuid,
  'Registration policy race tariff',
  'Disposable concurrent write proof',
  NULL,
  NULL,
  '{"clients": true}'::jsonb,
  'month',
  '{}'::jsonb,
  true
);
INSERT INTO public.saas_trial_policy (
  key, tariff_id, duration_days, grace_days, start_event, post_trial_behavior, is_active
) VALUES (
  'global',
  ${quoteLiteral(trialTariffId)}::uuid,
  14,
  3,
  'organization_provisioned',
  'read_only',
  true
);
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
  id, user_id, challenge_id, email_normalized, organization_title, organization_slug, specialist_full_name
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

async function applyStaffPrincipal(
  principal,
  lockedOptions,
  client,
  organizationId,
  platformUserId,
) {
  await principal.runWithDbStaffPrincipal({ organizationId, platformUserId }, async () => {
    const applied = await principal.applyCurrentDbPrincipalToConnection(client, lockedOptions);
    assert(applied === true, 'locked staff principal must be applied');
  });
}

async function assertStaffCommercialReadWall(principal, lockedOptions, ownReceipt, otherReceipt) {
  psql(`
SET ROLE ${quoteIdent(appOwnerRole)};
INSERT INTO public.saas_org_entitlement_overrides (
  organization_id, mechanic, enabled, quota, expires_at
) VALUES
  (${quoteLiteral(ownReceipt.organizationId)}::uuid, 'clients', true, '{"kind":"unlimited"}'::jsonb, NULL),
  (${quoteLiteral(otherReceipt.organizationId)}::uuid, 'clients', false, '{"kind":"numeric","limit":1}'::jsonb, NULL);
RESET ROLE;
`);

  await withRuntimeClient(async (client) => {
    await applyStaffPrincipal(
      principal,
      lockedOptions,
      client,
      ownReceipt.organizationId,
      users.first.userId,
    );
    try {
      const organizations = await client.query(
        'SELECT id::text FROM public.be_organizations ORDER BY id',
      );
      assert(
        organizations.rows.length === 1 && organizations.rows[0]?.id === ownReceipt.organizationId,
        'staff must read only its signed current organization',
      );

      const trials = await client.query(
        'SELECT organization_id::text FROM public.saas_organization_trials ORDER BY organization_id',
      );
      assert(
        trials.rows.length === 1 && trials.rows[0]?.organization_id === ownReceipt.organizationId,
        'staff must read only its signed current organization trial',
      );

      const overrides = await client.query(
        'SELECT organization_id::text FROM public.saas_org_entitlement_overrides ORDER BY organization_id',
      );
      assert(
        overrides.rows.length === 1 &&
          overrides.rows[0]?.organization_id === ownReceipt.organizationId,
        'staff must read only its signed current organization overrides',
      );

      const tariffs = await client.query('SELECT id::text FROM public.saas_tariffs ORDER BY id');
      assert(
        tariffs.rows.length === 2 &&
          tariffs.rows.some((row) => row.id === trialTariffId) &&
          tariffs.rows.some((row) => row.id === registrationPolicyRaceTariffId),
        'staff must retain global read visibility of the tariff catalog',
      );

      await assertStaffCommercialStatementDenied(
        client,
        'UPDATE public.saas_organization_trials SET status = status WHERE organization_id = $1::uuid',
        [ownReceipt.organizationId],
        'staff trial mutation',
      );
      await assertStaffCommercialStatementDenied(
        client,
        'UPDATE public.saas_org_entitlement_overrides SET enabled = NOT enabled WHERE organization_id = $1::uuid',
        [ownReceipt.organizationId],
        'staff override mutation',
      );
    } finally {
      await principal.clearDbPrincipalFromConnection(client, lockedOptions);
    }
  });
}

async function assertStaffCommercialStatementDenied(client, sql, parameters, label) {
  try {
    await client.query(sql, parameters);
  } catch (error) {
    assert(error?.code === '42501', `${label} must fail with insufficient_privilege`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
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

async function provisionSlugRace(principal, lockedOptions, winnerSeed, loserSeed) {
  const winnerClient = makeRuntimeClient();
  const loserClient = makeRuntimeClient();
  let winnerTransactionOpen = false;
  await Promise.all([winnerClient.connect(), loserClient.connect()]);
  try {
    await Promise.all([
      applyPatientPrincipal(principal, lockedOptions, winnerClient, winnerSeed.userId),
      applyPatientPrincipal(principal, lockedOptions, loserClient, loserSeed.userId),
    ]);
    await winnerClient.query('BEGIN');
    winnerTransactionOpen = true;
    const winner = await queryProvision(winnerClient, winnerSeed.challengeId);
    const loserPromise = queryProvision(loserClient, loserSeed.challengeId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await winnerClient.query('COMMIT');
    winnerTransactionOpen = false;
    const loser = await loserPromise;
    return [winner, loser];
  } finally {
    await Promise.allSettled([
      ...(winnerTransactionOpen ? [winnerClient.query('ROLLBACK')] : []),
      principal.clearDbPrincipalFromConnection(winnerClient, lockedOptions),
      principal.clearDbPrincipalFromConnection(loserClient, lockedOptions),
    ]);
    await Promise.allSettled([winnerClient.end(), loserClient.end()]);
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

function assertSlugRaceLoserRolledBack() {
  const state = JSON.parse(
    psqlScalar(`
SELECT json_build_object(
  'intent_status', (
    SELECT status
    FROM public.specialist_signup_intents
    WHERE id = ${quoteLiteral(users.slugRaceLoser.intentId)}::uuid
  ),
  'memberships', (
    SELECT count(*)
    FROM public.be_organization_members
    WHERE platform_user_id = ${quoteLiteral(users.slugRaceLoser.userId)}::uuid
  ),
  'organizations', (
    SELECT count(*)
    FROM public.be_organizations
    WHERE title = ${quoteLiteral(users.slugRaceLoser.organizationTitle)}
  ),
  'current_claims', (
    SELECT count(*)
    FROM public.organization_slug_claims
    WHERE slug = ${quoteLiteral(users.slugRaceLoser.organizationSlug)}
      AND kind = 'current'
  )
)::text;
`),
  );
  assert(state.intent_status === 'pending', 'losing slug-race intent must remain pending');
  assert(state.memberships === 0, 'losing slug-race registration must create no membership');
  assert(state.organizations === 0, 'losing slug-race registration must leave no organization');
  assert(state.current_claims === 1, 'the shared slug must have exactly the winner current claim');
}

function assertSameReceipt(left, right, label) {
  assert(left.ok === true && right.ok === true, `${label}: both calls must succeed`);
  assert(left.organizationId === right.organizationId, `${label}: organization must converge`);
  assert(left.membershipId === right.membershipId, `${label}: membership must converge`);
  // Superseded 2026-07-26 (was: both null, 'binding stays deferred') -- see the sibling note on the
  // first-provisioning assert above: the specialist is now bound inline, so a replay/concurrent call
  // must observe the SAME already-bound specialist, not a still-null one.
  assert(
    left.specialistId && left.specialistId === right.specialistId,
    `${label}: specialist binding must converge on the one specialist created by the first call`,
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
  'intent_specialist', (SELECT provisioned_specialist_id FROM public.specialist_signup_intents WHERE challenge_id = ${quoteLiteral(seed.challengeId)}::uuid),
  'current_slug_claims', (SELECT count(*) FROM public.organization_slug_claims WHERE slug = ${quoteLiteral(seed.organizationSlug)} AND kind = 'current' AND organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'directory_slug', (SELECT slug FROM public.clinic_public_directory_entries WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'organization_tariff', (SELECT tariff_id FROM public.be_organizations WHERE id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'trials', (SELECT count(*) FROM public.saas_organization_trials WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'trial_tariff', (SELECT tariff_id FROM public.saas_organization_trials WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'trial_status', (SELECT status FROM public.saas_organization_trials WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'trial_duration_days', (SELECT EXTRACT(EPOCH FROM (ends_at - started_at)) / 86400 FROM public.saas_organization_trials WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'trial_grace_days', (SELECT EXTRACT(EPOCH FROM (grace_ends_at - ends_at)) / 86400 FROM public.saas_organization_trials WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid),
  'trial_audit_events', (SELECT count(*) FROM public.admin_audit_log WHERE organization_id = ${quoteLiteral(receipt.organizationId)}::uuid AND action = 'saas_trial_start')
)::text;
`),
  );
  assert(row.organizations === 1, 'provisioning must create exactly one organization');
  assert(row.memberships === 1, 'provisioning must create exactly one membership');
  // Superseded 2026-07-26 (was: row.specialists === 0, 'provisioning must not create a specialist
  // before binding') -- feb80b75d binds the owner's specialist inline; see the note on the
  // first-provisioning assert in runCurrentContractProof for the full rationale.
  assert(row.specialists === 1, 'provisioning must create exactly one specialist for the owner');
  assert(row.enrollments === 0, 'owner provisioning must not create patient enrollment');
  assert(row.receipts === 1, 'organization must have one reference catalog receipt');
  assert(row.intent_status === 'provisioned', 'intent must be provisioned');
  assert(
    row.intent_specialist === receipt.specialistId,
    'intent specialist receipt must record the specialist bound by this same provisioning call',
  );
  assert(row.current_slug_claims === 1, 'signup provisioning must insert one current slug claim');
  assert(row.directory_slug === seed.organizationSlug, 'signup must publish the intent slug');
  assert(row.organization_tariff === trialTariffId, 'organization must receive the trial tariff');
  assert(row.trials === 1, 'provisioning replay must retain exactly one trial');
  assert(row.trial_tariff === trialTariffId, 'trial must snapshot the configured tariff');
  assert(row.trial_status === 'active', 'newly provisioned trial must be active');
  assert(Number(row.trial_duration_days) === 14, 'trial must use the configured duration');
  assert(Number(row.trial_grace_days) === 3, 'trial must use the configured grace period');
  assert(row.trial_audit_events === 1, 'trial assignment must emit exactly one audit event');
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
  // Superseded 2026-07-26: feb80b75d moved specialist creation into provisioning itself, so by the
  // time this helper runs (runCanonicalBindingHelper, right above) the owner already has a bound
  // specialist -- ensureOwnBookableSpecialist (apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts,
  // ensureOwnBookableSpecialist) hits its `if (membership.specialistId) return { created: false }`
  // early-out and never reaches its INSERT or its admin_audit_log write. What this now proves is that
  // the still-live bind-specialist route/repo path is a genuine no-op against an owner who no longer
  // needs it -- not a second specialist, not a duplicate audit row.
  assert(state.specialists === 1, 'binding-helper no-op must not create a second specialist');
  assert(
    state.membership_specialist === true,
    'binding-helper no-op must leave the specialist attached to the owner membership',
  );
  assert(
    state.audit_events === 0,
    'binding-helper no-op must not write a second specialist_self_binding_created event ' +
      "(provisioning itself creates none -- only ensureOwnBookableSpecialist's create path does)",
  );
  assert(
    state.intent_specialist === receipt.specialistId,
    'binding-helper no-op must not rewrite the specialist recorded by provisioning',
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
    /getPublicRuntimeBool\(['"]specialist_signup_enabled['"]\)/.test(source.rollout),
    'specialist signup must remain disabled by default',
  );
  assert(
    /specialist_signup_enabled:\s*runtime\(['"]admin['"],\s*['"]global['"],\s*['"]public['"],\s*['"]boolean['"],\s*['"]false['"]\)/.test(
      source.registry,
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
    source.ownerProvisioningOverlay.includes('INSERT INTO public.be_specialists (') &&
      source.ownerProvisioningOverlay.includes('IF v_specialist_id IS NULL THEN'),
    // Superseded 2026-07-26 (was: 'canonical organization provisioning must not create a
    // specialist'). commit feb80b75d ("fix(product): dead workspace after clinic signup")
    // deliberately moved specialist creation INTO this same transaction: a membership left with
    // specialist_id NULL made resolveLaunchCapabilities() withhold clinical.workspace forever
    // (owner-reported dead workspace). The new invariant this guard protects is idempotency, not
    // absence: the INSERT must stay guarded on v_specialist_id IS NULL so a re-run of provisioning
    // for an already-provisioned intent never creates a second specialist row.
    "canonical provisioning must bind the registering owner's own specialist row in the same " +
      'transaction, guarded so a re-run never creates a second one',
  );
  assert(
    source.ownerProvisioningOverlay.includes("'specialist_signup_active_membership_exists'"),
    'canonical provisioning must deny a second active staff organization',
  );
  assert(
    source.ownerProvisioningOverlay.includes('INSERT INTO public.organization_slug_claims (') &&
      source.ownerProvisioningOverlay.includes("'current'") &&
      source.ownerProvisioningOverlay.includes(
        "v_unique_constraint_name = 'uq_organization_slug_claims_slug'",
      ) &&
      source.ownerProvisioningOverlay.includes("'slug_unavailable'::text") &&
      !source.ownerProvisioningOverlay.includes('signup_intent_id') &&
      !source.ownerProvisioningOverlay.includes("kind = 'reservation'"),
    'canonical provisioning must claim current directly and map only the global slug unique race',
  );
  assert(
    source.migration0269.includes(
      'DROP FUNCTION IF EXISTS app.reserve_specialist_signup_slug(uuid, text)',
    ) &&
      source.migration0269.includes('DROP COLUMN signup_intent_id') &&
      source.migration0269.includes('ALTER COLUMN organization_id SET NOT NULL'),
    '0270 must remove signup-owned slug reservation state without removing the intent slug',
  );
  assert(
    source.ownerProvisioningOverlay.includes(
      'ALTER FUNCTION app.provision_specialist_owner(uuid) OWNER TO app_owner;',
    ),
    'canonical provisioning must stay owned by the trusted app_owner seam (NOLOGIN+BYPASSRLS) so ' +
      'its INSERT into FORCE-RLS public.be_organizations clears the wall that stalled self-signup',
  );
  assert(
    source.ownerProvisioningOverlay.includes(
      'ALTER FUNCTION app.current_provisioned_owner_organization() OWNER TO app_owner;',
    ),
    'this sibling helper must also stay owned by app_owner -- under the migrator it matches no ' +
      'FORCE-RLS policy on public.be_organizations and silently returns no row, which used to make ' +
      'every real provisioning call raise provisioned_owner_organization_required',
  );
  assert(
    source.provisioningRepo.includes('async ensureOwnBookableSpecialist') &&
      source.provisioningRepo.includes('specialist_self_binding_created'),
    'specialist binding must remain in the canonical provisioning repository',
  );
  assert(
    source.migration0225.includes('CREATE TABLE IF NOT EXISTS "saas_organization_trials"') &&
      source.c5aPlatformOperations.includes(
        'CREATE OR REPLACE FUNCTION app.start_provisioned_organization_trial()',
      ) &&
      source.c5aPlatformOperations.includes(
        'v_patient_user_id uuid := app.current_patient_user_id();',
      ) &&
      source.c5aPlatformOperations.includes(
        'GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_platform_settings;',
      ) &&
      source.c5aPlatformOperations.includes(
        'GRANT SELECT ON TABLE public.be_organization_members TO app_platform_settings;',
      ) &&
      source.c5aPlatformOperations.includes(
        'GRANT EXECUTE ON FUNCTION app.list_platform_organization_members(uuid)',
      ) &&
      source.c5aPlatformOperations.includes(
        'c5a_platform_organization_members_directory_exact_wall',
      ) &&
      source.migration0267.includes('WHERE membership.organization_id = p_organization_id') &&
      !source.migration0267.includes('phone_normalized') &&
      !source.migration0267.includes('email_normalized') &&
      source.c5aPlatformOperations.includes(
        'GRANT UPDATE (tariff_id, updated_at)',
      ) &&
      source.c5aPlatformOperations.includes(
        "NOT has_column_privilege('app_platform_settings', 'public.be_organizations', 'title', 'UPDATE')",
      ) &&
      source.c5aPlatformOperations.includes(
        'CREATE POLICY be_organizations_staff_current_org_read ON public.be_organizations',
      ) &&
      source.c5aPlatformOperations.includes(
        'CREATE POLICY saas_organization_trials_staff_current_org_read',
      ) &&
      source.c5aPlatformOperations.includes(
        'CREATE POLICY saas_org_entitlement_overrides_staff_current_org_read',
      ) &&
      source.ownerProvisioningOverlay.includes(
        'PERFORM app.start_provisioned_organization_trial();',
      ) &&
      source.ownerProvisioningOverlay.includes(
        'WHERE member.platform_user_id = app.current_patient_user_id()',
      ),
    'specialist provisioning must retain the canonical C5A trial-assignment chain',
  );
  assertOrder(
    source.prodDeploy,
    [
      'require_file "${PROJECT_ROOT}/${C5A_PLATFORM_OPERATIONS_RUNTIME}"',
      'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${SPECIALIST_OWNER_PROVISIONING_RLS}"',
      'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${C5A_PLATFORM_OPERATIONS_RUNTIME}"',
      'psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${PROJECT_ROOT}/${REFERENCE_CATALOG_RLS}"',
    ],
    'production deploy C5A post-migration overlay order',
  );
  assert(
    source.c5aPlatformOperations.includes("RAISE EXCEPTION 'registration_tariff_policy_tariff_invalid'") &&
      source.c5aPlatformOperations.includes('FROM public.saas_registration_tariff_policy AS reg') &&
      source.c5aPlatformOperations.includes('WHERE tariff.id = v_registration_tariff_id') &&
      source.c5aPlatformOperations.includes('AND tariff.is_active'),
    'C5A must distinguish legal NULL registration policy from a broken non-NULL tariff reference',
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
