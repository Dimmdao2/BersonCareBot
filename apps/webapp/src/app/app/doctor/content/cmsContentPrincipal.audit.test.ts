import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const cmsLegacyActionFiles = [
  "src/app/app/doctor/content/actions.ts",
  "src/app/app/doctor/content/sections/actions.ts",
];

describe("CMS content legacy actions workspace principal coverage", () => {
  it.each(cmsLegacyActionFiles)("%s uses selected workspace principal for legacy write actions", (file) => {
    const src = readSource(file);
    expect(src).not.toContain("requireDoctorAccess");
    expect(src).toContain("requireDoctorWorkspaceContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it("content page writes require principal-aware mutation transactions and org stamps", () => {
    const src = readSource("src/infra/repos/pgContentPages.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
    expect(src).not.toContain("db.transaction(async");
  });

  it("content section writes require principal-aware mutation transactions and org stamps", () => {
    const src = readSource("src/infra/repos/pgContentSections.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
    expect(src).not.toContain("db.transaction(async");
  });
});
