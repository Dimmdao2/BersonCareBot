import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  "../../../db/drizzle-migrations/0254_auth_rate_limit_action_accessors.sql",
);
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

describe("0254 auth rate-limit action accessors", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const grants = readFileSync(bootstrapGrantsPath, "utf8");

  it("registers migration 0254 immediately after 0253", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"idx": 254');
    expect(journal).toContain('"version": "7"');
    expect(journal).toContain('"when": 1793539200051');
    expect(journal).toContain('"tag": "0254_auth_rate_limit_action_accessors"');
    expect(journal).toContain('"breakpoints": true');
  });

  it("pins every accessor to app_owner and closes PUBLIC execute", () => {
    for (const signature of [
      "app.auth_rate_limit_prune_scope(",
      "app.auth_rate_limit_prune_key(",
      "app.auth_rate_limit_count(",
      "app.auth_rate_limit_record(",
    ]) {
      const fn = functionStatement(migration, signature);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog");
    }
    expect(migration.match(/OWNER TO app_owner;/g)).toHaveLength(4);
    expect(migration.match(/REVOKE ALL ON FUNCTION app\.auth_rate_limit_/g)).toHaveLength(4);
  });

  it("re-states exact predicates and the bounded scope-prune operation", () => {
    const scopePrune = functionStatement(
      migration,
      "app.auth_rate_limit_prune_scope(",
    );
    expect(scopePrune).toContain("event.scope = p_scope");
    expect(scopePrune).toContain("event.occurred_at <= p_cutoff");
    expect(scopePrune).toContain("LEAST(1000, GREATEST(1, COALESCE(p_batch_size, 1)))");
    expect(scopePrune).toContain("FOR UPDATE SKIP LOCKED");

    for (const signature of [
      "app.auth_rate_limit_prune_key(",
      "app.auth_rate_limit_count(",
    ]) {
      const fn = functionStatement(migration, signature);
      expect(fn).toContain("event.scope = p_scope");
      expect(fn).toContain("event.key = p_key");
    }
    expect(functionStatement(migration, "app.auth_rate_limit_prune_key(")).toContain(
      "event.occurred_at <= p_cutoff",
    );
    expect(functionStatement(migration, "app.auth_rate_limit_record(")).toContain(
      "VALUES (p_scope, p_key, now())",
    );
  });

  it("grants exact signatures to both live caller roles without a runtime table grant", () => {
    const signatures = [
      "auth_rate_limit_prune_scope(text, timestamptz, integer)",
      "auth_rate_limit_prune_key(text, text, timestamptz)",
      "auth_rate_limit_count(text, text)",
      "auth_rate_limit_record(text, text)",
    ];
    for (const signature of signatures) {
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION app.${signature} TO app_patient;`,
      );
      expect(
        guardedPsqlStatement(
          grants,
          `GRANT EXECUTE ON FUNCTION app.${signature} TO %I`,
        ),
      ).toContain(":'d3_4_bootstrap_base_role'");
      expect(
        guardedPsqlStatement(
          grants,
          `REVOKE EXECUTE ON FUNCTION app.${signature} FROM %I`,
        ),
      ).toContain(":'d3_4_bootstrap_base_role'");
    }

    const runtimeGrantSources = `${migration}\n${grants}`;
    expect(runtimeGrantSources).not.toMatch(
      /GRANT\s+[^;]*ON TABLE public\.auth_rate_limit_events TO app_patient/,
    );
    expect(runtimeGrantSources).not.toMatch(
      /GRANT\s+[^;]*ON TABLE public\.auth_rate_limit_events TO :"d3_4_bootstrap_base_role"/,
    );
  });

  it("pins the four reviewed definers and their three app_owner table privileges", () => {
    const deploy = readFileSync(deployPath, "utf8");
    expect(deploy).toContain("local expected_secdef_count=80");
    for (const row of [
      "('public.auth_rate_limit_events', 'SELECT')",
      "('public.auth_rate_limit_events', 'INSERT')",
      "('public.auth_rate_limit_events', 'DELETE')",
    ]) {
      expect(deploy).toContain(row);
    }

    const ownershipOverlay = readFileSync(inviteOwnershipPath, "utf8");
    expect(ownershipOverlay).not.toContain("auth_rate_limit_");
  });
});
