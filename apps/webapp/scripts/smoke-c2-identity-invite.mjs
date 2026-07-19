#!/usr/bin/env node
/**
 * Disposable C2 database proof. It never reads application env or connects to DEV/TEST/PROD.
 * The private PostgreSQL harness follows the existing SaaS scratch-smoke pattern.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pgBin = "/usr/lib/postgresql/16/bin";
const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(path.join(os.tmpdir(), "bcb_c2_identity_scratch_"));
const socket = path.join(os.tmpdir(), `bcb_c2_${process.pid}`);
const data = path.join(dir, "data");
const port = String(56432 + (process.pid % 1000));
const log = path.join(dir, "postgres.log");
const db = `bcb_c2_identity_scratch_${stamp}`;
const defaultOrg = "a0000000-0000-4000-8000-000000000001";
const specialist = "518ea988-9b5e-4ad8-8194-a2d98f43bd7b";
const owner = "11111111-1111-4111-8111-111111111111";
const globalA = "22222222-2222-4222-8222-222222222222";
const globalB = "33333333-3333-4333-8333-333333333333";
const inviteUser = "44444444-4444-4444-8444-444444444444";
const existingInviteEmail = "existing-invite@example.test";
const newInviteEmail = "new-invite@example.test";

function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", input });
  if (result.status !== 0) {
    const serverLog = existsSync(log) ? readFileSync(log, "utf8") : "";
    throw new Error(`${command} ${args.join(" ")}\n${result.stderr || result.stdout}\n${serverLog}`);
  }
  return result.stdout;
}

function sql(text) {
  return run(path.join(pgBin, "psql"), ["-h", socket, "-p", port, "-v", "ON_ERROR_STOP=1", "-At", "-d", db], text);
}

function sqlAsync(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(pgBin, "psql"), ["-h", socket, "-p", port, "-v", "ON_ERROR_STOP=1", "-d", db]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`concurrent psql failed: ${stderr}`)));
    child.stdin.end(text);
  });
}

function file(rel) {
  sql(readFileSync(path.join(root, rel), "utf8"));
}

function assertEq(actual, expected, label) {
  if (actual.trim() !== expected) throw new Error(`${label}: expected ${expected}, got ${actual.trim()}`);
}

function baseSchema() {
  sql(`
    CREATE EXTENSION pgcrypto;
    CREATE SCHEMA app;
    CREATE ROLE app_owner NOLOGIN BYPASSRLS;
    CREATE ROLE app_patient NOLOGIN NOBYPASSRLS;
    CREATE ROLE app_staff NOLOGIN NOBYPASSRLS;
    CREATE TABLE be_organizations (id uuid PRIMARY KEY, title text);
    CREATE TABLE be_specialists (id uuid PRIMARY KEY, organization_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true, full_name text NOT NULL DEFAULT '');
    CREATE TABLE be_appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), specialist_id uuid NOT NULL);
    CREATE TABLE platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role text NOT NULL, phone_normalized text, merged_into_id uuid,
      is_archived boolean NOT NULL DEFAULT false, display_name text, email text, email_normalized text,
      email_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX platform_users_active_email_unique
      ON platform_users (email_normalized)
      WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL;
    CREATE TABLE email_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, email text NOT NULL,
      code_hash text NOT NULL, expires_at bigint NOT NULL, attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE email_send_cooldowns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, email_normalized text NOT NULL,
      last_sent_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO be_organizations VALUES ('${defaultOrg}', 'Scratch clinic');
    INSERT INTO be_specialists VALUES ('${specialist}', '${defaultOrg}', true, 'Owner');
    INSERT INTO be_appointments (specialist_id) VALUES ('${specialist}');
    INSERT INTO platform_users (id, role, phone_normalized, display_name) VALUES
      ('${owner}', 'doctor', '+79643805480', 'Owner'),
      ('${globalA}', 'admin', '+70000000001', 'Global A'),
      ('${globalB}', 'admin', '+70000000002', 'Global B'),
      ('${inviteUser}', 'client', '+70000000003', 'Existing client');
  `);
}

function assertRepairAndFreshChain() {
  baseSchema();
  file("apps/webapp/db/drizzle-migrations/0141_be_organization_members.sql");
  file("apps/webapp/db/drizzle-migrations/0143_seed_staff_organization_members.sql");
  assertEq(sql(`SELECT count(*) FROM be_organization_members WHERE role='admin';`), "0", "fresh 0143 chain does not seed global admin");
  // Explicit old-applied-0143 shape: its former global-admin seed ran before C2.
  sql(`INSERT INTO be_organization_members (organization_id, platform_user_id, role, specialist_id) VALUES
    ('${defaultOrg}', '${globalA}', 'admin', NULL),
    ('${defaultOrg}', '${globalB}', 'admin', NULL);`);
  file("apps/webapp/db/drizzle-migrations/0204_promote_legacy_solo_owner_membership.sql");
  file("apps/webapp/db/drizzle-migrations/0207_remove_seeded_global_admin_membership.sql");
  assertEq(sql(`SELECT count(*) FROM be_organization_members WHERE organization_id='${defaultOrg}' AND role='admin';`), "0", "repair removes every old seed shape");
  assertEq(sql(`SELECT count(*) FROM platform_users WHERE id IN ('${globalA}','${globalB}');`), "2", "repair preserves platform users");
  assertEq(sql(`SELECT role FROM be_organization_members WHERE platform_user_id='${owner}';`), "owner", "owner promotion preserved");
  file("apps/webapp/db/drizzle-migrations/0207_remove_seeded_global_admin_membership.sql");
  assertEq(sql(`SELECT count(*) FROM be_organization_members WHERE platform_user_id='${owner}';`), "1", "repair repeat is idempotent");
  const duplicate = spawnSync(path.join(pgBin, "psql"), ["-h", socket, "-p", port, "-v", "ON_ERROR_STOP=1", "-d", db], {
    encoding: "utf8", input: `INSERT INTO be_organization_members (organization_id, platform_user_id, role) VALUES ('${defaultOrg}', '${owner}', 'owner');`,
  });
  if (duplicate.status === 0) throw new Error("membership unique invariant did not reject duplicate");
}

async function assertInviteLifecycleAndConcurrency() {
  file("apps/webapp/db/drizzle-migrations/0179_organization_member_invites.sql");
  file("deploy/postgres/organization-member-invites-rls.sql");
  // Exercise the deployed SECURITY DEFINER function against the same generated-ID/default
  // shape and partial active-email uniqueness invariant it depends on in production.
  sql(`UPDATE platform_users
    SET email_normalized='${existingInviteEmail}', email='${existingInviteEmail}'
    WHERE id='${inviteUser}';`);
  assertEq(
    sql(`SELECT user_id::text || '|' || was_created::text
      FROM app.email_otp_public_find_or_create_user('${existingInviteEmail}');`),
    `${inviteUser}|false`,
    "existing email identity is reused by public OTP lookup",
  );
  const newIdentityFirst = sql(`SELECT user_id::text || '|' || was_created::text
    FROM app.email_otp_public_find_or_create_user('${newInviteEmail}');`).trim().split("|");
  if (newIdentityFirst.length !== 2 || newIdentityFirst[1] !== "true") {
    throw new Error(`new email identity was not created exactly once: ${newIdentityFirst.join("|")}`);
  }
  const newInviteUser = newIdentityFirst[0];
  assertEq(
    sql(`SELECT user_id::text || '|' || was_created::text
      FROM app.email_otp_public_find_or_create_user('${newInviteEmail}');`),
    `${newInviteUser}|false`,
    "new email identity is reused on a repeated public OTP lookup",
  );
  assertEq(sql(`SELECT count(*) FROM platform_users WHERE email_normalized='${newInviteEmail}';`), "1", "new email creates one platform user");

  // Both resolved identities can accept exactly one invite membership; replay must stay
  // relationship-idempotent and must not create a second row.
  sql(`INSERT INTO organization_member_invites (organization_id, invited_email, invited_role, token_hash, expires_at, created_by_platform_user_id)
    VALUES
      ('${defaultOrg}', '${existingInviteEmail}', 'doctor', 'existing-accept-token', now() + interval '7 days', '${owner}'),
      ('${defaultOrg}', '${newInviteEmail}', 'doctor', 'new-accept-token', now() + interval '7 days', '${owner}');
    SELECT ok, role FROM app.accept_org_invite('existing-accept-token', '${inviteUser}', '${existingInviteEmail}');
    SELECT ok, role FROM app.accept_org_invite('new-accept-token', '${newInviteUser}', '${newInviteEmail}');`);
  assertEq(sql(`SELECT count(*) FROM platform_users WHERE email_normalized='${existingInviteEmail}';`), "1", "existing identity remains one platform user");
  assertEq(sql(`SELECT count(*) FROM be_organization_members WHERE organization_id='${defaultOrg}' AND platform_user_id='${inviteUser}';`), "1", "existing identity accept creates one membership");
  assertEq(sql(`SELECT count(*) FROM be_organization_members WHERE organization_id='${defaultOrg}' AND platform_user_id='${newInviteUser}';`), "1", "new identity accept creates one membership");
  assertEq(sql(`SELECT code FROM app.accept_org_invite('existing-accept-token', '${inviteUser}', '${existingInviteEmail}');`), "reused_token", "accept replay rejected");
  sql(`INSERT INTO organization_member_invites (organization_id, invited_email, invited_role, token_hash, expires_at, created_by_platform_user_id)
    VALUES ('${defaultOrg}', 'expired@example.test', 'admin', 'expired-token', now() - interval '1 second', '${owner}'),
           ('${defaultOrg}', 'revoked@example.test', 'admin', 'revoked-token', now() + interval '7 days', '${owner}');
    UPDATE organization_member_invites SET status='revoked' WHERE token_hash='revoked-token';`);
  assertEq(sql(`SELECT code FROM app.accept_org_invite('expired-token', '${inviteUser}', 'expired@example.test');`), "expired_token", "expired invite rejected");
  assertEq(sql(`SELECT code FROM app.accept_org_invite('revoked-token', '${inviteUser}', 'revoked@example.test');`), "reused_token", "revoked invite rejected");
  const provision = `BEGIN; DO $$ DECLARE current_specialist uuid; created_specialist uuid; BEGIN SELECT specialist_id INTO current_specialist FROM be_organization_members WHERE organization_id='${defaultOrg}' AND platform_user_id='${inviteUser}' FOR UPDATE; PERFORM pg_sleep(0.2); IF current_specialist IS NULL THEN INSERT INTO be_specialists (id, organization_id, is_active, full_name) VALUES (gen_random_uuid(), '${defaultOrg}', true, 'Existing client') RETURNING id INTO created_specialist; UPDATE be_organization_members SET specialist_id=created_specialist WHERE organization_id='${defaultOrg}' AND platform_user_id='${inviteUser}' AND specialist_id IS NULL; END IF; END $$; COMMIT;`;
  await Promise.all([sqlAsync(provision), sqlAsync(provision)]);
  assertEq(sql(`SELECT count(*) FROM be_specialists s JOIN be_organization_members m ON m.specialist_id=s.id WHERE m.organization_id='${defaultOrg}' AND m.platform_user_id='${inviteUser}';`), "1", "concurrent first login creates exactly one specialist");
  const replacement = `BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${defaultOrg}:replace@example.test', 0)); UPDATE organization_member_invites SET status='revoked' WHERE organization_id='${defaultOrg}' AND invited_email='replace@example.test' AND status='pending'; SELECT pg_sleep(0.2); INSERT INTO organization_member_invites (organization_id, invited_email, invited_role, token_hash, expires_at, created_by_platform_user_id) VALUES ('${defaultOrg}','replace@example.test','doctor',gen_random_uuid()::text,now()+interval '7 days','${owner}'); COMMIT;`;
  await Promise.all([sqlAsync(replacement), sqlAsync(replacement)]);
  assertEq(sql(`SELECT count(*) FROM organization_member_invites WHERE organization_id='${defaultOrg}' AND invited_email='replace@example.test' AND status='pending';`), "1", "concurrent replacement leaves one pending invite");
}

try {
  mkdirSync(socket, { recursive: true });
  run(path.join(pgBin, "initdb"), ["-D", data, "-A", "trust", "--no-locale"]);
  run(path.join(pgBin, "pg_ctl"), ["-D", data, "-l", log, "-o", `-k ${socket} -p ${port} -c listen_addresses=''`, "-w", "start"]);
  run(path.join(pgBin, "createdb"), ["-h", socket, "-p", port, db]);
  assertRepairAndFreshChain();
  await assertInviteLifecycleAndConcurrency();
  console.log("C2 scratch migration/invite proof: OK");
} finally {
  spawnSync(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { encoding: "utf8" });
  rmSync(socket, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
}
