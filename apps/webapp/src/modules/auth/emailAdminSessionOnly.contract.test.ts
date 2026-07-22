import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webappRoot = resolve(import.meta.dirname, "../../..");
const repoRoot = resolve(webappRoot, "../..");
const readRepo = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), "utf8");

describe("owner email admin is session-only", () => {
  const dataFix = readRepo("deploy/postgres/p0-data-fix-doctor-admin-split.sql");
  const migration = readRepo("apps/webapp/db/drizzle-migrations/0233_demote_legacy_email_admin_artifact.sql");
  const journal = readRepo("apps/webapp/db/drizzle-migrations/meta/_journal.json");

  it("stops the canonical data-fix from creating an email-derived admin row", () => {
    expect(dataFix).toContain("owner email remains session-only");
    expect(dataFix).not.toContain("INSERT INTO platform_users (id, role, display_name, email");
    expect(dataFix).not.toContain("c_admin_email");
  });

  it("demotes only the proven credential-less legacy artifact after 0232", () => {
    expect(journal).toContain('"idx": 233');
    expect(journal).toContain('"tag": "0233_demote_legacy_email_admin_artifact"');
    for (const predicate of [
      "platform_user.role = 'admin'",
      "platform_user.display_name = 'Дмитрий Берсон'",
      "platform_user.email = 'dimmdao@gmail.com'",
      "platform_user.email_normalized = 'dimmdao@gmail.com'",
      "platform_user.phone_normalized IS NULL",
      "platform_user.integrator_user_id IS NULL",
      "platform_user.merged_into_id IS NULL",
      "platform_user.is_archived IS FALSE",
      "public.user_channel_bindings",
      "public.user_oauth_bindings",
      "public.user_password_credentials",
      "public.user_pins",
      "public.login_tokens",
    ]) {
      expect(migration).toContain(predicate);
    }
    expect(migration).not.toContain("email_verified_at IS NULL");
    expect(migration).toContain("SET role = 'client'");
    expect(migration).not.toMatch(/UPDATE\s+public\.platform_users\s+SET\s+role\s*=\s*'client'\s*;/i);
  });
});
