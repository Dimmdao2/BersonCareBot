import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webappRoot = resolve(import.meta.dirname, "../../..");
const repoRoot = resolve(webappRoot, "../..");
const readRepo = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), "utf8");

describe("email OTP public atomic consume contract", () => {
  const migration = readRepo("apps/webapp/db/drizzle-migrations/0232_email_otp_atomic_consume.sql");
  const journal = readRepo("apps/webapp/db/drizzle-migrations/meta/_journal.json");
  const overlay = readRepo("deploy/postgres/organization-member-invites-rls.sql");
  const handoff = readRepo("deploy/postgres/runtime-overlay-app-owner-handoff.sql");
  const bootstrapGrants = readRepo("deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql");
  const d34Checker = readRepo(
    "docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs",
  );
  const publicPort = readRepo("apps/webapp/src/modules/auth/emailOtpPublicPort.ts");
  const pgPort = readRepo("apps/webapp/src/infra/repos/pgEmailOtpPublic.ts");
  const publicFlow = readRepo("apps/webapp/src/modules/auth/emailOtpPublic.ts");

  it("is additive after 0231 and declares the ordered migration journal entry", () => {
    expect(journal).toContain('"tag": "0231_admin_email_role_runtime_config"');
    expect(journal).toContain('"idx": 232');
    expect(journal).toContain('"tag": "0232_email_otp_atomic_consume"');
    expect(migration).not.toMatch(/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
    expect(readRepo("apps/webapp/db/drizzle-migrations/0136_email_otp_query_indexes.sql")).toContain(
      "idx_email_challenges_email",
    );
  });

  it("locks principal rows first, then the exact latest challenge and rechecks it", () => {
    const principalLock = migration.indexOf("FROM public.platform_users AS candidate");
    const challengeLock = migration.indexOf("FROM public.email_challenges AS challenge", principalLock + 1);
    expect(principalLock).toBeGreaterThanOrEqual(0);
    expect(challengeLock).toBeGreaterThan(principalLock);
    expect(migration).toContain("ORDER BY candidate.id\n  FOR UPDATE");
    expect(migration).toContain("ORDER BY challenge.created_at DESC, challenge.id DESC\n    LIMIT 1\n    FOR UPDATE");
    expect(migration).toContain("EXIT WHEN v_latest_challenge_id = v_challenge.id;");
  });

  it("returns the canonical result surface and performs expiry, attempts, verified claim, and consume atomically", () => {
    expect(migration).toContain("RETURNS TABLE (\n  ok boolean,\n  code text,\n  user_id uuid,\n  retry_after_seconds integer\n)");
    for (const code of ["expired_code", "invalid_code", "too_many_attempts", "email_conflict"]) {
      expect(migration).toContain(`'${code}'::text`);
    }
    expect(migration).toContain("'too_many_attempts'::text, NULL::uuid, 600");
    expect(migration).toContain("email_verified_at = clock_timestamp()");
    expect(migration).toContain("DELETE FROM public.email_challenges WHERE user_id = v_target_user.id");
    expect(migration).toContain("RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer");
  });

  it("keeps raw OTPs and direct challenge-table access out of the public path", () => {
    expect(migration).toContain("p_code_hash text");
    expect(migration).not.toContain("p_code text");
    expect(publicFlow).toContain("hashEmailChallengeCode(code)");
    expect(publicFlow).toContain("consumeLatestEmailChallenge(email, hashEmailChallengeCode(code))");
    expect(publicFlow).not.toContain("findLatestEmailChallengeByEmail");
    expect(publicFlow).not.toContain("confirmEmailChallenge(");
    expect(publicPort).toContain("consumeLatestEmailChallenge");
    expect(publicPort).not.toContain("findLatestEmailChallengeByEmail");
    expect(pgPort).toContain("app.email_otp_public_consume_latest_challenge($1, $2)");
    expect(pgPort).not.toContain("email_otp_public_find_latest_email_challenge_by_email");
  });

  it("holds the SECURITY DEFINER boundary to app_owner, app_patient, and the canonical bootstrap login", () => {
    const signature = "app.email_otp_public_consume_latest_challenge(text, text)";
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog");
    expect(migration).toContain(`ALTER FUNCTION ${signature} OWNER TO app_owner`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO app_patient`);
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*email_challenges/i);
    expect(overlay).toContain(`ALTER FUNCTION ${signature} OWNER TO app_owner`);
    expect(overlay).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(overlay).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO app_patient`);
    expect(handoff.match(/app\.email_otp_public_consume_latest_challenge\(text,text\)/g)).toHaveLength(3);
    expect(bootstrapGrants).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM :"d3_4_bootstrap_base_role"`);
    expect(bootstrapGrants).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO :"d3_4_bootstrap_base_role"`);
    expect(d34Checker).toContain('"app.email_otp_public_consume_latest_challenge(text, text)"');
  });
});
