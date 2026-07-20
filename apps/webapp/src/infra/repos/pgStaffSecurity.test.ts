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
    expect(source).not.toContain("staffSecurityProfiles");
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
  });

  it("keeps session refresh behind the same narrow security-state projection", () => {
    const source = readFileSync(join(here, "pgUserByPhone.ts"), "utf8");
    expect(source).toContain("app.get_staff_security_session_state(pu.id)");
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
      "ALTER FUNCTION app.complete_staff_totp_enrollment(uuid, text, jsonb)\n  OWNER TO :specialist_signup_staff_security_owner_ident",
    );
    expect(overlay).toContain(
      "GRANT EXECUTE ON FUNCTION app.complete_staff_totp_enrollment(uuid, text, jsonb) TO app_staff",
    );
    expect(overlay).not.toContain(
      "GRANT EXECUTE ON FUNCTION app.complete_staff_totp_enrollment(uuid, text, jsonb) TO app_patient",
    );
    expect(overlay).toContain(
      "GRANT EXECUTE ON FUNCTION app.revoke_staff_sessions(uuid) TO app_staff, app_patient",
    );
  });
});
