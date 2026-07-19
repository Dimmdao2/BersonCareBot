import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../../../db/drizzle-migrations");

describe("organization membership seed and C2 repair", () => {
  it("retains the database uniqueness path for one organization person", () => {
    const source = readFileSync(join(migrationsDir, "0141_be_organization_members.sql"), "utf8");

    expect(source).toContain("UNIQUE (organization_id, platform_user_id)");
  });

  it("seeds only the legacy doctor into the default organization", () => {
    const source = readFileSync(join(migrationsDir, "0143_seed_staff_organization_members.sql"), "utf8");

    expect(source).toContain("WHERE pu.role = 'doctor'");
    expect(source).not.toContain("WHERE pu.role IN ('doctor', 'admin')");
    expect(source).not.toContain("v_seeded_admin_count");
  });

  it("removes only the historical global-admin membership while retaining the platform user", () => {
    const source = readFileSync(join(migrationsDir, "0207_remove_seeded_global_admin_membership.sql"), "utf8");

    expect(source).toContain("DELETE FROM be_organization_members AS m");
    expect(source).toContain("m.organization_id = v_default_org_id");
    expect(source).toContain("m.role = 'admin'");
    expect(source).toContain("m.specialist_id IS NULL");
    expect(source).toContain("pu.role = 'admin'");
    expect(source).toContain("v_remaining_count <> 0");
    expect(source).not.toContain("DELETE FROM platform_users");
    expect(source).not.toContain("display_name");
  });
});
