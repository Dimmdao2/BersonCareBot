import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("createPgOrganizationProvisioningPort", () => {
  it("keeps specialist owner provisioning in one transaction and does not create owner org enrollment", () => {
    const src = readFileSync(join(__dirname, "pgOrganizationProvisioning.ts"), "utf8");

    expect(src).toContain("runWebappTransaction");
    expect(src).toContain("beOrganizations");
    expect(src).toContain("beSpecialists");
    expect(src).toContain("beOrganizationMembers");
    expect(src).toContain('role: "owner"');
    expect(src).toContain('role: "doctor"');
    expect(src).toContain('.for("update")');
    expect(src).toContain("provisionedOrganizationId");
    expect(src).not.toContain("orgEnrollments");
  });
});
