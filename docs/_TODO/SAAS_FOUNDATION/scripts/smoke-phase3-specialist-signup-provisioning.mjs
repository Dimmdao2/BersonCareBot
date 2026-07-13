#!/usr/bin/env node
/**
 * Phase 3 specialist signup provisioning smoke.
 *
 * Scratch-only proof for the Phase 3 M4 specialist signup path. The script creates and drops its own
 * disposable `bcb_saas_phase3_signup_scratch_*` database via local `sudo -n -u postgres`, never uses
 * app `DATABASE_URL`, and refuses obvious prod/test/dev parent DB hints before touching PostgreSQL.
 *
 * Covered properties:
 *   1. `specialist_signup_enabled` stays system_settings-backed with default `false`, and the start /
 *      confirm routes hard-stop before side-effect calls when the flag is off (static source guard).
 *   2. Enabled provisioning creates `be_organizations`, `be_specialists`, and an owner
 *      `be_organization_members` row.
 *   3. Owner provisioning does not create an `org_enrollments` row.
 *   4. Replay / idempotency / concurrency returns the already provisioned intent result instead of
 *      creating duplicate organization/specialist/membership rows.
 *   5. Cleanup and refusal rules are explicit; child commands strip `DATABASE_URL` / `PG*` env vars.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const requireFromWebapp = createRequire(path.join(repoRoot, "apps/webapp/package.json"));
const { Client } = requireFromWebapp("pg");

const scratchSuffix = `p${process.pid}_${randomBytes(4).toString("hex")}`.toLowerCase();
const dbName = `bcb_saas_phase3_signup_scratch_${scratchSuffix}`;
const appRole = `bcb_saas_phase3_signup_app_scratch_${scratchSuffix}`;
const appPassword = randomBytes(24).toString("base64url");

const routeStartPath = path.join(
  repoRoot,
  "apps/webapp/src/app/api/auth/specialist-signup/start/route.ts",
);
const routeConfirmPath = path.join(
  repoRoot,
  "apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts",
);
const rolloutPath = path.join(repoRoot, "apps/webapp/src/modules/auth/specialistSignupRollout.ts");
const provisioningRepoPath = path.join(
  repoRoot,
  "apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts",
);
const systemSettingsTypesPath = path.join(
  repoRoot,
  "apps/webapp/src/modules/system-settings/types.ts",
);

let cleanedUp = false;

assertSafeScratchName(dbName);
assertSafeScratchName(appRole);
assertNoUnsafeParentDbHints();
assertStaticSourceGuards();
installSignalCleanup();

main().catch((error) => {
  console.error(`[phase3-signup] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  try {
    createScratchDatabase();
    installScratchSchema();
    await runProvisioningProofs();
    console.log(`[phase3-signup] OK (${dbName})`);
  } finally {
    cleanupScratch();
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSafeScratchName(name) {
  if (!/^bcb_saas_[a-z0-9_]+_scratch_[a-z0-9_]+$/.test(name)) {
    throw new Error(`refusing unsafe scratch resource name: ${name}`);
  }

  const normalized = name.toLowerCase();
  const forbiddenExact = new Set([
    "bcb_webapp_prod",
    "bcb_webapp_test",
    "bcb_webapp_dev",
    "bersoncarebot_prod",
    "bersoncarebot_test",
    "bersoncarebot_dev",
    "production",
    "prod",
    "test",
    "dev",
  ]);
  if (forbiddenExact.has(normalized)) {
    throw new Error(`refusing prod/test/dev-shaped resource name: ${name}`);
  }
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    throw new Error(`refusing prod/test/dev-shaped resource name: ${name}`);
  }
}

function databaseNameFromUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/^\/+/, "");
    return pathname ? decodeURIComponent(pathname) : null;
  } catch {
    return null;
  }
}

function unsafeParentDbReason(name) {
  if (!name) return "empty or unparsable DB name";
  const normalized = name.toLowerCase();
  if (
    new Set([
      "bcb_webapp_prod",
      "bcb_webapp_test",
      "bcb_webapp_dev",
      "bersoncarebot_prod",
      "bersoncarebot_test",
      "bersoncarebot_dev",
      "production",
      "prod",
      "test",
      "dev",
    ]).has(normalized)
  ) {
    return `forbidden DB name ${name}`;
  }
  if (/(^|[_-])(prod|production|test|testing|dev|development)([_-]|$)/.test(normalized)) {
    return `prod/test/dev-shaped DB name ${name}`;
  }
  return null;
}

function assertNoUnsafeParentDbHints() {
  const candidates = [];
  if (process.env.DATABASE_URL) {
    candidates.push({ source: "DATABASE_URL", name: databaseNameFromUrl(process.env.DATABASE_URL) });
  }
  if (process.env.PGDATABASE) {
    candidates.push({ source: "PGDATABASE", name: process.env.PGDATABASE });
  }

  for (const candidate of candidates) {
    const reason = unsafeParentDbReason(candidate.name);
    if (reason) throw new Error(`${candidate.source}: ${reason}; refusing scratch smoke`);
  }
}

function sanitizedChildEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPASSWORD",
    "PGPASSFILE",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGUSER",
  ]) {
    delete env[key];
  }
  return env;
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: sanitizedChildEnv(),
    input: options.input,
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, { database = "postgres" } = {}) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], {
    input: sql,
  });
}

function createScratchDatabase() {
  psql(
    `
DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE);
DROP ROLE IF EXISTS ${quoteIdent(appRole)};
CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD ${quoteLiteral(appPassword)};
CREATE DATABASE ${quoteIdent(dbName)} OWNER ${quoteIdent(appRole)};
`.trim(),
  );
}

function installScratchSchema() {
  psql(
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET ROLE ${quoteIdent(appRole)};

CREATE TABLE platform_users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'client',
  updated_at timestamptz NOT NULL DEFAULT now(),
  merged_into_id uuid,
  email_verified_at timestamptz,
  CONSTRAINT platform_users_role_check
    CHECK (role = ANY (ARRAY['client'::text, 'doctor'::text, 'admin'::text])),
  CONSTRAINT platform_users_no_self_merge
    CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE TABLE system_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT uq_system_settings_global UNIQUE NULLS NOT DISTINCT (key, scope, organization_id)
);

CREATE TABLE be_organizations (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE be_specialists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE be_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  role text NOT NULL,
  specialist_id uuid REFERENCES be_specialists(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_be_organization_members_org_user UNIQUE (organization_id, platform_user_id),
  CONSTRAINT be_organization_members_role_check
    CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'doctor'::text, 'assistant'::text])),
  CONSTRAINT be_organization_members_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'invited'::text, 'disabled'::text]))
);

CREATE TABLE org_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_enrollments_org_user UNIQUE (organization_id, platform_user_id),
  CONSTRAINT org_enrollments_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'invited'::text, 'discharged'::text, 'archived'::text]))
);

CREATE TABLE specialist_signup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL,
  email_normalized text NOT NULL,
  organization_title text NOT NULL,
  specialist_full_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provisioned_organization_id uuid REFERENCES be_organizations(id) ON DELETE SET NULL,
  provisioned_specialist_id uuid REFERENCES be_specialists(id) ON DELETE SET NULL,
  provisioned_membership_id uuid REFERENCES be_organization_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  provisioned_at timestamptz,
  CONSTRAINT specialist_signup_intents_challenge_id_key UNIQUE (challenge_id),
  CONSTRAINT specialist_signup_intents_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'provisioned'::text]))
);

CREATE INDEX idx_specialist_signup_intents_user_pending
  ON specialist_signup_intents USING btree (user_id, status);

CREATE OR REPLACE FUNCTION scratch_phase3_provision_specialist_owner(
  p_user_id uuid,
  p_challenge_id uuid,
  p_delay_seconds double precision DEFAULT 0
)
RETURNS TABLE (
  organization_id uuid,
  specialist_id uuid,
  membership_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_intent specialist_signup_intents%ROWTYPE;
  v_now timestamptz := now();
  v_verified_user_id uuid;
BEGIN
  SELECT *
    INTO v_intent
    FROM specialist_signup_intents
   WHERE user_id = p_user_id
     AND challenge_id = p_challenge_id
     AND status = 'pending'
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT *
      INTO v_intent
      FROM specialist_signup_intents
     WHERE user_id = p_user_id
       AND challenge_id = p_challenge_id
       AND status = 'provisioned'
     LIMIT 1
     FOR UPDATE;

    IF FOUND
       AND v_intent.provisioned_organization_id IS NOT NULL
       AND v_intent.provisioned_specialist_id IS NOT NULL
       AND v_intent.provisioned_membership_id IS NOT NULL THEN
      RETURN QUERY
      SELECT
        v_intent.provisioned_organization_id,
        v_intent.provisioned_specialist_id,
        v_intent.provisioned_membership_id;
      RETURN;
    END IF;

    RAISE EXCEPTION 'specialist_signup_intent_not_found';
  END IF;

  IF p_delay_seconds > 0 THEN
    PERFORM pg_sleep(p_delay_seconds);
  END IF;

  UPDATE platform_users
     SET role = 'doctor',
         display_name = v_intent.specialist_full_name,
         updated_at = v_now
   WHERE id = p_user_id
     AND merged_into_id IS NULL
     AND email_verified_at IS NOT NULL
  RETURNING id INTO v_verified_user_id;

  IF v_verified_user_id IS NULL THEN
    RAISE EXCEPTION 'specialist_signup_user_not_verified';
  END IF;

  INSERT INTO be_organizations (id, title, is_active, sort_order, created_at, updated_at)
  VALUES (gen_random_uuid(), v_intent.organization_title, true, 0, v_now, v_now)
  RETURNING id INTO organization_id;

  INSERT INTO be_specialists (organization_id, full_name, is_active, sort_order, created_at, updated_at)
  VALUES (organization_id, v_intent.specialist_full_name, true, 0, v_now, v_now)
  RETURNING id INTO specialist_id;

  INSERT INTO be_organization_members (
    organization_id,
    platform_user_id,
    role,
    specialist_id,
    status,
    created_at,
    updated_at
  )
  VALUES (organization_id, p_user_id, 'owner', specialist_id, 'active', v_now, v_now)
  RETURNING id INTO membership_id;

  UPDATE specialist_signup_intents
     SET status = 'provisioned',
         provisioned_organization_id = organization_id,
         provisioned_specialist_id = specialist_id,
         provisioned_membership_id = membership_id,
         provisioned_at = v_now
   WHERE id = v_intent.id;

  RETURN NEXT;
END;
$$;

RESET ROLE;
`.trim(),
    { database: dbName },
  );
}

async function runProvisioningProofs() {
  const first = {
    userId: "11111111-1111-4111-8111-111111111111",
    challengeId: "22222222-2222-4222-8222-222222222222",
    emailNormalized: "doctor.owner@example.com",
    organizationTitle: "Clinic One",
    specialistFullName: "Doctor Owner",
  };

  const second = {
    userId: "33333333-3333-4333-8333-333333333333",
    challengeId: "44444444-4444-4444-8444-444444444444",
    emailNormalized: "doctor.concurrent@example.com",
    organizationTitle: "Clinic Two",
    specialistFullName: "Doctor Concurrent",
  };

  await withClient(async (client) => {
    await seedSystemSetting(client, null);
    await assertSystemSettingRows(client, 0);
    await seedSystemSetting(client, false);
    await assertSystemSettingRows(client, 1);
    await seedPendingIntent(client, first);

    const firstProvision = await provision(client, first.userId, first.challengeId, 0);
    await assertProvisionedState(client, first, firstProvision);

    const replayProvision = await provision(client, first.userId, first.challengeId, 0);
    assert(
      replayProvision.organizationId === firstProvision.organizationId &&
        replayProvision.specialistId === firstProvision.specialistId &&
        replayProvision.membershipId === firstProvision.membershipId,
      "replay must return the original provisioned ids",
    );
    await assertProvisionedState(client, first, firstProvision);

    await seedSystemSetting(client, true);
    await assertSystemSettingRows(client, 1);
  });

  await runConcurrentReplayProof(second);
}

async function runConcurrentReplayProof(seed) {
  await withClient(async (client) => {
    await seedPendingIntent(client, seed);
  });

  const clientA = makeClient();
  const clientB = makeClient();
  await connectClient(clientA);
  await connectClient(clientB);

  try {
    const firstPromise = provision(clientA, seed.userId, seed.challengeId, 1.5);
    await sleep(150);
    const secondPromise = provision(clientB, seed.userId, seed.challengeId, 0);
    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);

    assert(
      firstResult.organizationId === secondResult.organizationId &&
        firstResult.specialistId === secondResult.specialistId &&
        firstResult.membershipId === secondResult.membershipId,
      "concurrent replay must converge on the same provisioned ids",
    );

    await withClient(async (client) => {
      await assertProvisionedState(client, seed, firstResult);
    });
  } finally {
    await clientA.end().catch(() => {});
    await clientB.end().catch(() => {});
  }
}

async function seedSystemSetting(client, enabled) {
  if (enabled == null) {
    await client.query("DELETE FROM system_settings WHERE key = 'specialist_signup_enabled'");
    return;
  }

  await client.query(
    `
      INSERT INTO system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
      VALUES ('specialist_signup_enabled', 'admin', NULL, $1::jsonb, now(), 'phase3-smoke')
      ON CONFLICT (key, scope, organization_id) DO UPDATE
        SET value_json = EXCLUDED.value_json,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
    `,
    [JSON.stringify({ value: enabled })],
  );
}

async function assertSystemSettingRows(client, expectedCount) {
  const count = await fetchCount(
    client,
    "SELECT count(*)::integer AS count FROM system_settings WHERE key = 'specialist_signup_enabled'",
  );
  assert(
    count === expectedCount,
    `expected ${expectedCount} specialist_signup_enabled row(s), got ${count}`,
  );
}

async function seedPendingIntent(client, input) {
  const now = "2026-07-12T00:00:00.000Z";
  await client.query(
    `
      INSERT INTO platform_users (id, display_name, role, updated_at, email_verified_at)
      VALUES ($1::uuid, 'Pending User', 'client', $2::timestamptz, $2::timestamptz)
    `,
    [input.userId, now],
  );
  await client.query(
    `
      INSERT INTO specialist_signup_intents (
        user_id,
        challenge_id,
        email_normalized,
        organization_title,
        specialist_full_name
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5)
    `,
    [
      input.userId,
      input.challengeId,
      input.emailNormalized,
      input.organizationTitle,
      input.specialistFullName,
    ],
  );
}

async function provision(client, userId, challengeId, delaySeconds) {
  const result = await client.query(
    `
      SELECT
        organization_id::text AS organization_id,
        specialist_id::text AS specialist_id,
        membership_id::text AS membership_id
      FROM scratch_phase3_provision_specialist_owner($1::uuid, $2::uuid, $3::double precision)
    `,
    [userId, challengeId, delaySeconds],
  );
  const row = result.rows[0];
  assert(row, "provisioning function returned no row");
  return {
    organizationId: row.organization_id,
    specialistId: row.specialist_id,
    membershipId: row.membership_id,
  };
}

async function assertProvisionedState(client, seed, expected) {
  const intentRow = await fetchRow(
    client,
    `
      SELECT
        status,
        provisioned_organization_id::text AS organization_id,
        provisioned_specialist_id::text AS specialist_id,
        provisioned_membership_id::text AS membership_id
      FROM specialist_signup_intents
      WHERE user_id = $1::uuid AND challenge_id = $2::uuid
    `,
    [seed.userId, seed.challengeId],
  );

  assert(intentRow.status === "provisioned", "signup intent must move to provisioned");
  assert(intentRow.organization_id === expected.organizationId, "intent must store organization id");
  assert(intentRow.specialist_id === expected.specialistId, "intent must store specialist id");
  assert(intentRow.membership_id === expected.membershipId, "intent must store membership id");

  const userRow = await fetchRow(
    client,
    `
      SELECT role, display_name
      FROM platform_users
      WHERE id = $1::uuid
    `,
    [seed.userId],
  );
  assert(userRow.role === "doctor", "platform user role must be promoted to doctor");
  assert(
    userRow.display_name === seed.specialistFullName,
    "platform user display_name must follow specialist full name",
  );

  const membershipRow = await fetchRow(
    client,
    `
      SELECT
        organization_id::text AS organization_id,
        platform_user_id::text AS platform_user_id,
        role,
        specialist_id::text AS specialist_id,
        status
      FROM be_organization_members
      WHERE id = $1::uuid
    `,
    [expected.membershipId],
  );
  assert(membershipRow.organization_id === expected.organizationId, "membership must point to new organization");
  assert(membershipRow.platform_user_id === seed.userId, "membership must point to owner user");
  assert(membershipRow.role === "owner", "membership role must be owner");
  assert(membershipRow.specialist_id === expected.specialistId, "membership must point to specialist");
  assert(membershipRow.status === "active", "membership status must be active");

  const organizationRow = await fetchRow(
    client,
    `
      SELECT title, is_active, sort_order
      FROM be_organizations
      WHERE id = $1::uuid
    `,
    [expected.organizationId],
  );
  assert(organizationRow.title === seed.organizationTitle, "organization title must match signup intent");
  assert(organizationRow.is_active === true, "organization must be active");
  assert(organizationRow.sort_order === 0, "organization sort order must default to 0");

  const specialistRow = await fetchRow(
    client,
    `
      SELECT
        organization_id::text AS organization_id,
        full_name,
        is_active,
        sort_order
      FROM be_specialists
      WHERE id = $1::uuid
    `,
    [expected.specialistId],
  );
  assert(specialistRow.organization_id === expected.organizationId, "specialist must belong to new organization");
  assert(specialistRow.full_name === seed.specialistFullName, "specialist name must match signup intent");
  assert(specialistRow.is_active === true, "specialist must be active");
  assert(specialistRow.sort_order === 0, "specialist sort order must default to 0");

  const orgCount = await fetchCount(
    client,
    "SELECT count(*)::integer AS count FROM be_organizations WHERE id = $1::uuid",
    [expected.organizationId],
  );
  const specialistCount = await fetchCount(
    client,
    "SELECT count(*)::integer AS count FROM be_specialists WHERE id = $1::uuid",
    [expected.specialistId],
  );
  const membershipCount = await fetchCount(
    client,
    "SELECT count(*)::integer AS count FROM be_organization_members WHERE id = $1::uuid",
    [expected.membershipId],
  );
  const ownerEnrollmentCount = await fetchCount(
    client,
    `
      SELECT count(*)::integer AS count
      FROM org_enrollments
      WHERE organization_id = $1::uuid AND platform_user_id = $2::uuid
    `,
    [expected.organizationId, seed.userId],
  );

  assert(orgCount === 1, "provisioning must create exactly one organization row");
  assert(specialistCount === 1, "provisioning must create exactly one specialist row");
  assert(membershipCount === 1, "provisioning must create exactly one membership row");
  assert(ownerEnrollmentCount === 0, "provisioning must not create an owner org_enrollments row");
}

function makeClient() {
  return new Client({
    database: dbName,
    host: "127.0.0.1",
    password: appPassword,
    port: 5432,
    ssl: false,
    user: appRole,
  });
}

async function connectClient(client) {
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      [
        `could not connect to scratch DB as disposable role ${appRole}`,
        "local pg_hba must allow localhost password auth for this live smoke",
        `postgres error: ${error instanceof Error ? error.message : String(error)}`,
      ].join("; "),
    );
  }
}

async function withClient(fn) {
  const client = makeClient();
  await connectClient(client);
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function fetchRow(client, queryText, values = []) {
  const result = await client.query(queryText, values);
  const row = result.rows[0];
  assert(row, `expected row for query: ${queryText.trim().slice(0, 80)}...`);
  return row;
}

async function fetchCount(client, queryText, values = []) {
  const row = await fetchRow(client, queryText, values);
  return Number(row.count);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertStaticSourceGuards() {
  const rolloutSource = readFileSync(rolloutPath, "utf8");
  const startSource = readFileSync(routeStartPath, "utf8");
  const confirmSource = readFileSync(routeConfirmPath, "utf8");
  const provisioningRepoSource = readFileSync(provisioningRepoPath, "utf8");
  const systemSettingsTypesSource = readFileSync(systemSettingsTypesPath, "utf8");

  assert(
    rolloutSource.includes('getConfigBool("specialist_signup_enabled", false)'),
    "rollout helper must keep specialist_signup_enabled defaulted to false",
  );
  assert(
    systemSettingsTypesSource.includes('"specialist_signup_enabled"'),
    "specialist_signup_enabled must remain in system_settings allowlist",
  );

  assertOrder(
    startSource,
    [
      "const specialistSignupEnabled = await getSpecialistSignupEnabled();",
      "if (!specialistSignupEnabled) {",
      "const deps = buildAppDeps();",
      "registerPendingSpecialistVerification({",
      "startEmailChallenge(",
      "createSpecialistSignupIntent({",
    ],
    "start route must hard-stop on disabled rollout before any provisioning side effects",
  );

  assertOrder(
    confirmSource,
    [
      "const specialistSignupEnabled = await getSpecialistSignupEnabled();",
      "if (!specialistSignupEnabled) {",
      "const deps = buildAppDeps();",
      "findUserIdByEmailChallengeId(",
      "confirmEmailChallenge(",
      "provisionSpecialistOwner({",
    ],
    "confirm route must hard-stop on disabled rollout before verify/provision side effects",
  );

  assert(
    provisioningRepoSource.includes('.for("update")'),
    "provisioning repo must keep FOR UPDATE locking for replay/concurrency safety",
  );
  assert(
    provisioningRepoSource.includes('eq(specialistSignupIntents.status, "provisioned")'),
    "provisioning repo must keep the provisioned replay path",
  );
  assert(
    provisioningRepoSource.includes('role: "owner"') && provisioningRepoSource.includes('role: "doctor"'),
    "provisioning repo must keep owner membership creation and doctor promotion",
  );
  assert(
    !provisioningRepoSource.includes("orgEnrollments"),
    "provisioning repo must not insert owner org_enrollments rows",
  );
}

function assertOrder(source, snippets, message) {
  let cursor = -1;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet, cursor + 1);
    if (index === -1) {
      throw new Error(`${message}; missing snippet: ${snippet}`);
    }
    if (index < cursor) {
      throw new Error(`${message}; out-of-order snippet: ${snippet}`);
    }
    cursor = index;
  }
}

function installSignalCleanup() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      try {
        cleanupScratch();
      } finally {
        process.exit(signal === "SIGINT" ? 130 : 143);
      }
    });
  }
}

function cleanupScratch() {
  if (cleanedUp) return;
  cleanedUp = true;

  try {
    psql(
      `
DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE);
DROP ROLE IF EXISTS ${quoteIdent(appRole)};
`.trim(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[phase3-signup] cleanup warning: ${message}`);
  }
}
