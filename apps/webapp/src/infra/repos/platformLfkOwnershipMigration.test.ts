import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "db/drizzle-migrations/0217_platform_lfk_ownership.sql"),
  "utf8",
);

describe("0217 platform LFK ownership", () => {
  it("uses an explicit tagged union and never treats NULL alone as platform ownership", () => {
    expect(migration).toContain("owner_kind = 'organization' AND organization_id IS NOT NULL");
    expect(migration).toContain("owner_kind = 'platform' AND organization_id IS NULL");
    expect(migration).toContain("lfk_child_owner_mismatch");
    expect(migration).toContain("lfk_media_owner_mismatch");
    expect(migration).toContain("legacy NULL owner rows require explicit organization reconciliation");
    expect(migration).not.toContain("SET owner_kind = 'platform'");
  });

  it("seals operator writes to platform rows and audits every mutation", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("platform_lfk_owner_mismatch");
    expect(migration).toContain("platform_lfk_template_exercise_mismatch");
    expect(migration).toContain("INSERT INTO public.admin_audit_log");
    expect(migration).toContain("REVOKE ALL ON FUNCTION app.c4d_platform_lfk_save_exercise");
  });

  it("does not introduce store packages, grants, purchases or clinic copies", () => {
    expect(migration).not.toContain("exercise_packages");
    expect(migration).not.toContain("content_access_grants");
    expect(migration).not.toContain("purchase");
  });
});
