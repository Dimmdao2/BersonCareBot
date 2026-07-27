import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../..");

describe("staff security database boundary", () => {
  it("uses only narrow app functions from the runtime repository", () => {
    const source = readFileSync(join(here, "pgStaffSecurity.ts"), "utf8");
    expect(source).toContain("app.get_staff_security_profile");
    expect(source).toContain("app.complete_staff_totp_enrollment");
    expect(source).toContain("app.consume_staff_recovery_login");
    expect(source).not.toContain("$1::uuid");
    expect(source).not.toMatch(/app\.[a-z_]+\([^)]*user/iu);
    expect(source).not.toContain("staffSecurityProfiles");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
  });

  it("keeps session refresh behind the same narrow security-state projection", () => {
    const source = readFileSync(join(here, "pgUserByPhone.ts"), "utf8");
    expect(source).toContain("app.get_staff_security_session_state()");
    expect(source).not.toContain("LEFT JOIN staff_security_profiles");
  });

  it("reasserts exact owners and grants in the canonical specialist bootstrap overlay", () => {
    const migration = readFileSync(
      join(repoRoot, "apps/webapp/db/drizzle-migrations/0215_staff_security_profiles.sql"),
      "utf8",
    );
    const overlay = readFileSync(
      join(repoRoot, "deploy/postgres/specialist-signup-public-bootstrap-rls.sql"),
      "utf8",
    );

    expect(migration).toContain("REVOKE ALL ON TABLE public.staff_security_profiles FROM PUBLIC");
    expect(migration).toContain("SET search_path = pg_catalog");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "uq_specialist_signup_intents_user_id"');
    expect(overlay).toContain("apply migrations through 0215");
    expect(overlay).toContain(
      "ALTER FUNCTION app.complete_staff_totp_enrollment(text, jsonb)\n  OWNER TO :specialist_signup_staff_security_owner_ident",
    );
    expect(overlay).toContain(
      "GRANT EXECUTE ON FUNCTION app.complete_staff_totp_enrollment(text, jsonb) TO app_patient",
    );
    for (const signature of [
      "app.get_staff_security_session_state()",
      "app.ensure_staff_security_profile()",
      "app.get_staff_security_profile()",
      "app.save_pending_staff_totp(text)",
    ]) {
      expect(overlay).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO app_patient`);
      expect(overlay).not.toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO app_staff`);
    }
    expect(overlay).not.toContain(
      "GRANT EXECUTE ON FUNCTION app.complete_staff_totp_enrollment(text, jsonb) TO app_staff",
    );
    expect(overlay).toContain(
      "GRANT EXECUTE ON FUNCTION app.revoke_staff_sessions() TO app_patient",
    );
    expect(overlay).toContain(
      "GRANT USAGE ON SCHEMA app TO :specialist_signup_staff_security_owner_ident;",
    );
    expect(overlay).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE public.staff_security_profiles FROM app_patient, app_staff;",
    );
    expect(overlay).toContain(
      "REVOKE ALL PRIVILEGES (%s) ON TABLE public.staff_security_profiles FROM app_patient, app_staff",
    );
    expect(overlay).toContain("WHERE attrelid = 'public.staff_security_profiles'::regclass");
    expect(overlay).toContain("specialist_signup_staff_security_runtime_acl_closed");
    expect(overlay).toContain("NOT has_table_privilege(");
    expect(overlay).toContain("AND NOT has_any_column_privilege(");
    expect(overlay).not.toMatch(
      /GRANT [^;]* ON TABLE public\.staff_security_profiles TO app_(?:patient|staff)/u,
    );
    expect(overlay).toContain(
      "specialist_signup_staff_security_owner_schema_usage_ok",
    );
    expect(overlay).toContain(
      "has_schema_privilege(\n  :'specialist_signup_staff_security_owner',\n  'app',\n  'USAGE'",
    );
    expect(overlay).toContain(
      "REVOKE USAGE ON SCHEMA app FROM :specialist_signup_staff_security_owner_ident;",
    );
    expect(overlay).not.toContain("GRANT USAGE ON SCHEMA app TO app_patient");
    expect(overlay).not.toContain("GRANT USAGE ON SCHEMA app TO app_staff");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION app.require_staff_security_self_user_id()");
    expect(migration).toContain("app.current_patient_user_id()");
    expect(migration).not.toMatch(/FUNCTION app\.(?:ensure|get|save|complete|confirm|begin|consume|record|revoke)_staff_[^(]+\([^)]*uuid/u);
    expect(overlay).not.toMatch(/GRANT EXECUTE ON FUNCTION app\.(?:ensure|get|save|complete|confirm|begin|consume|record|revoke)_staff_[^(]+\([^)]*\) TO app_staff/u);
  });

  it("pins the real nonstaff -> app_patient TOTP-start ACL and TEST keyring preflight in deploy closure", () => {
    const deploy = readFileSync(
      join(repoRoot, "deploy/host/deploy-test-saas.sh"),
      "utf8",
    );

    expect(deploy).toContain("assert_webapp_test_staff_security_keyring_available");
    expect(deploy).toContain("STAFF_SECURITY_KEYRING_JSON is missing or invalid");
    expect(deploy).toContain("assert_staff_security_self_runtime_acl_ready");
    expect(deploy).toContain("SET ROLE app_patient");
    expect(deploy).toContain(
      "has_function_privilege(current_user, 'app.ensure_staff_security_profile()', 'EXECUTE')",
    );
    expect(deploy).toContain(
      "has_function_privilege(current_user, 'app.get_staff_security_profile()', 'EXECUTE')",
    );
    expect(deploy).toContain(
      "has_function_privilege(current_user, 'app.get_staff_security_session_state()', 'EXECUTE')",
    );
    expect(deploy).toContain(
      "has_function_privilege(current_user, 'app.save_pending_staff_totp(text)', 'EXECUTE')",
    );
    expect(deploy).toContain("NOT has_table_privilege(");
    expect(deploy).toContain("NOT has_any_column_privilege(");
    expect(deploy).toContain("local expected_secdef_count=106");
  });
});
