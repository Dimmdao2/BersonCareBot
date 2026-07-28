import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(repoDir, "../../../db/drizzle-migrations/0252_patient_action_accessors.sql");
const journalPath = join(repoDir, "../../../db/drizzle-migrations/meta/_journal.json");
const deployPath = join(repoDir, "../../../../../deploy/host/deploy-test-saas.sh");
const bootstrapGrantsPath = join(
  repoDir,
  "../../../../../deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
);
const inviteOwnershipPath = join(
  repoDir,
  "../../../../../deploy/postgres/organization-member-invites-rls.sql",
);

function functionStatement(migration: string, signature: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = migration.indexOf("$function$", start);
  const bodyEnd = migration.indexOf("$function$", bodyStart + "$function$".length);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(start, bodyEnd + "$function$".length);
}

function guardedPsqlStatement(source: string, statement: string): string {
  const start = source.indexOf(`'${statement}'`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\\gexec", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + "\\gexec".length);
}

describe("0252 patient action accessors", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("registers the required custom-SQL migration journal entry", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"idx": 252');
    expect(journal).toContain('"version": "7"');
    expect(journal).toContain('"when": 1793539200049');
    expect(journal).toContain('"tag": "0252_patient_action_accessors"');
  });

  it("gives each action a pinned app_owner definer and closes PUBLIC execute", () => {
    const signatures = [
      "app.phone_challenge_store_upsert(",
      "app.phone_challenge_store_read(",
      "app.phone_challenge_store_delete(",
      "app.phone_challenge_store_delete_by_phone(",
      "app.phone_challenge_store_increment_attempts(",
      "app.phone_auth_find_otp_lock(",
      "app.phone_auth_find_latest_challenge_created_at(",
      "app.phone_auth_register_otp_lockout(",
      "app.phone_auth_reset_otp_lockout(",
      "app.read_patient_lfk_complex_cover(",
      "app.read_patient_lfk_complex_exercise_lines(",
      "app.read_platform_lfk_media_entitlement_refs(",
    ];
    for (const signature of signatures) {
      const fn = functionStatement(migration, signature);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog");
    }
    expect(migration.match(/OWNER TO app_owner;/g)).toHaveLength(12);
    expect(migration.match(/REVOKE ALL ON FUNCTION app\./g)).toHaveLength(12);
  });

  it("lets app_patient read only its current tenant and user LFK rows", () => {
    for (const signature of [
      "app.read_patient_lfk_complex_cover(p_complex_id uuid)",
      "app.read_patient_lfk_complex_exercise_lines(p_complex_ids uuid[])",
    ]) {
      const fn = functionStatement(migration, signature);
      expect(fn).toContain("app.current_org_id() IS NOT NULL");
      expect(fn).toContain("app.current_patient_user_id() IS NOT NULL");
      expect(fn).toContain("complex.organization_id = app.current_org_id()");
      expect(fn).toContain("complex.platform_user_id = app.current_patient_user_id()");
      expect(fn).toContain("complex.user_id = app.current_patient_user_id()::text");
    }
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION app.read_patient_lfk_complex_cover(uuid) TO app_patient;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION app.read_patient_lfk_complex_exercise_lines(uuid[]) TO app_patient;",
    );
  });

  it("never exposes organization-owned rows through the platform media mapping", () => {
    const fn = functionStatement(
      migration,
      "app.read_platform_lfk_media_entitlement_refs(p_media_id uuid)",
    );
    expect(fn).toContain("media.owner_kind = 'platform'");
    expect(fn).toContain("media.organization_id IS NULL");
    expect(fn).toContain("exercise.owner_kind = 'platform'");
    expect(fn).toContain("exercise.organization_id IS NULL");
    expect(fn).toContain("file.owner_kind = 'platform'");
    expect(fn).toContain("file.organization_id IS NULL");
    expect(fn).toContain("template.organization_id = app.current_org_id()");
    expect(fn).toContain("template_exercise.organization_id = app.current_org_id()");
  });

  it("limits phone actions to the supplied bearer id or exact phone and grants the bare login", () => {
    for (const signature of [
      "app.phone_challenge_store_read(p_challenge_id text)",
      "app.phone_challenge_store_delete(p_challenge_id text)",
      "app.phone_challenge_store_increment_attempts(",
    ]) {
      expect(functionStatement(migration, signature)).toContain(
        "challenge.challenge_id = p_challenge_id",
      );
    }
    expect(functionStatement(
      migration,
      "app.phone_challenge_store_delete_by_phone(p_phone text)",
    )).toContain("challenge.phone = p_phone");
    expect(functionStatement(
      migration,
      "app.phone_challenge_store_upsert(",
    )).toContain("WHERE challenge.phone = EXCLUDED.phone");
    expect(functionStatement(
      migration,
      "app.phone_auth_find_otp_lock(p_phone text)",
    )).toContain("lock_row.phone_normalized = p_phone");
    expect(functionStatement(
      migration,
      "app.phone_auth_find_latest_challenge_created_at(p_phone text)",
    )).toContain("challenge.phone = p_phone");
    const registerLockout = functionStatement(
      migration,
      "app.phone_auth_register_otp_lockout(",
    );
    expect(registerLockout).toContain("VALUES (p_phone, 1, p_now_sec + 120)");
    expect(registerLockout).toContain(
      "p_now_sec + LEAST(1800, (120 * power(2, LEAST(phone_otp_locks.lockout_cycle, 10)))::bigint)",
    );
    expect(functionStatement(
      migration,
      "app.phone_auth_reset_otp_lockout(p_phone text)",
    )).toContain("lock_row.phone_normalized = p_phone");

    const grants = readFileSync(bootstrapGrantsPath, "utf8");
    for (const signature of [
      "phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer)",
      "phone_challenge_store_read(text)",
      "phone_challenge_store_delete(text)",
      "phone_challenge_store_delete_by_phone(text)",
      "phone_challenge_store_increment_attempts(text, bigint)",
      "phone_auth_find_otp_lock(text)",
      "phone_auth_find_latest_challenge_created_at(text)",
      "phone_auth_register_otp_lockout(text, bigint)",
      "phone_auth_reset_otp_lockout(text)",
    ]) {
      const grant = guardedPsqlStatement(
        grants,
        `GRANT EXECUTE ON FUNCTION app.${signature} TO %I`,
      );
      expect(grant).toContain(":'d3_4_bootstrap_base_role'");
      const revoke = guardedPsqlStatement(
        grants,
        `REVOKE EXECUTE ON FUNCTION app.${signature} FROM %I`,
      );
      expect(revoke).toContain(":'d3_4_bootstrap_base_role'");
    }
    expect(grants).not.toMatch(
      /GRANT\s+[^;]*ON TABLE public\.phone_challenges TO :"d3_4_bootstrap_base_role"/,
    );
    expect(grants).not.toMatch(
      /GRANT\s+[^;]*ON TABLE public\.phone_otp_locks TO :"d3_4_bootstrap_base_role"/,
    );
  });

  it("pins the reviewed count/grants without entering the deploy ownership trap", () => {
    const deploy = readFileSync(deployPath, "utf8");
    // 106 -> 107: 0267 adds the staff-name directory accessor, 0268 adds the delivery-audit
    // writer, and 0269 removes the superseded signup-slug reservation function.
    expect(deploy).toContain("local expected_secdef_count=110");
    for (const row of [
      "('public.lfk_complexes', 'SELECT')",
      "('public.lfk_complex_exercises', 'SELECT')",
      "('public.lfk_complex_templates', 'SELECT')",
      "('public.lfk_complex_template_exercises', 'SELECT')",
      "('public.lfk_exercises', 'SELECT')",
      "('public.lfk_exercise_media', 'SELECT')",
    ]) {
      expect(deploy).toContain(row);
    }

    const ownershipOverlay = readFileSync(inviteOwnershipPath, "utf8");
    for (const accessor of [
      "phone_challenge_store_",
      "phone_auth_",
      "read_patient_lfk_complex_",
      "read_platform_lfk_media_entitlement_refs",
    ]) {
      expect(ownershipOverlay).not.toContain(accessor);
    }
  });
});
