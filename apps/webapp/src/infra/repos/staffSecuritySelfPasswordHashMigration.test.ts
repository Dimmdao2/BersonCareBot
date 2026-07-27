import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  "../../../db/drizzle-migrations/0256_staff_security_self_password_hash.sql",
);
const journalPath = join(repoDir, "../../../db/drizzle-migrations/meta/_journal.json");
const credentialsRepoPath = join(repoDir, "pgUserPasswordCredentials.ts");
const deployPath = join(repoDir, "../../../../../deploy/host/deploy-test-saas.sh");
const inviteOwnershipPath = join(
  repoDir,
  "../../../../../deploy/postgres/organization-member-invites-rls.sql",
);

function functionStatement(migration: string): string {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION app.set_staff_security_self_password_hash(",
  );
  expect(start).toBeGreaterThan(-1);
  const bodyStart = migration.indexOf("$function$", start);
  const bodyEnd = migration.indexOf("$function$", bodyStart + "$function$".length);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(start, bodyEnd + "$function$".length);
}

describe("0256 staff-security self password hash", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("registers journal slot 256 immediately after the deployed 0255 migration", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"idx": 256');
    expect(journal).toContain('"version": "7"');
    expect(journal).toContain('"when": 1793539200053');
    expect(journal).toContain('"tag": "0256_staff_security_self_password_hash"');
    expect(journal).toContain('"breakpoints": true');
  });

  it("derives identity only from the fail-closed self-principal seam and repeats the row predicate", () => {
    const fn = functionStatement(migration);
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog");
    expect(fn).toContain(
      "v_user_id := app.require_staff_security_self_user_id();",
    );
    expect(fn).toContain("WHERE credentials.user_id = v_user_id");
    expect(fn).not.toContain("p_user_id");
    expect(fn).not.toMatch(
      /set_staff_security_self_password_hash\s*\([^)]*uuid/i,
    );
  });

  it("pins owner, grantee, minimal app_owner grants, and no app_patient table grant", () => {
    const signature = "app.set_staff_security_self_password_hash(text)";
    expect(migration).toContain(`ALTER FUNCTION ${signature} OWNER TO app_owner;`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO app_patient;`);
    expect(migration).toContain(
      "GRANT SELECT, UPDATE ON TABLE public.user_password_credentials TO app_owner;",
    );
    expect(migration).not.toMatch(
      /GRANT\s+[^;]*ON TABLE public\.user_password_credentials TO app_patient/i,
    );
  });

  it("wires updatePasswordHash through the self accessor without passing a user id", () => {
    const repository = readFileSync(credentialsRepoPath, "utf8");
    const methodStart = repository.indexOf("async updatePasswordHash(");
    const methodEnd = repository.indexOf("async upsertPasswordHash(", methodStart);
    expect(methodStart).toBeGreaterThan(-1);
    expect(methodEnd).toBeGreaterThan(methodStart);
    const method = repository.slice(methodStart, methodEnd);

    expect(method).toContain("app.set_staff_security_self_password_hash($1::text)");
    expect(method).toContain("[passwordHash]");
    expect(method).not.toMatch(/\bUPDATE\s+(?:public\.)?user_password_credentials\b/i);
    expect(method).not.toContain("[userId, passwordHash]");
  });

  it("pins deploy grant completeness without entering the re-ownership trap", () => {
    const deploy = readFileSync(deployPath, "utf8");
    expect(deploy).toContain("local expected_secdef_count=105");
    expect(deploy).toContain("('public.user_password_credentials', 'SELECT')");
    expect(deploy).toContain("('public.user_password_credentials', 'UPDATE')");

    const ownershipOverlay = readFileSync(inviteOwnershipPath, "utf8");
    expect(ownershipOverlay).not.toContain("set_staff_security_self_password_hash");
  });
});
