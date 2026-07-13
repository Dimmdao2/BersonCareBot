import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const doctorApiWriteRoutes = [
  "src/app/api/doctor/courses/route.ts",
  "src/app/api/doctor/courses/[id]/route.ts",
  "src/app/api/doctor/references/[categoryCode]/route.ts",
];

const doctorActionFiles = [
  "src/app/app/doctor/references/actions.ts",
];

const adminApiWriteRoutes = [
  "src/app/api/admin/references/[itemId]/archive/route.ts",
];

describe("doctor courses/references residual principal coverage", () => {
  it.each(doctorApiWriteRoutes)("%s uses selected workspace principal for write handlers", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it("POST /api/doctor/courses is gated by the courses entitlement", () => {
    const src = readSource("src/app/api/doctor/courses/route.ts");
    expect(src).toContain('requireEntitlement("courses")');
  });

  it.each(doctorActionFiles)("%s uses selected workspace principal for server action writes", (file) => {
    const src = readSource(file);
    expect(src).not.toContain("requireDoctorAccess");
    expect(src).toContain("requireDoctorWorkspaceContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it.each(adminApiWriteRoutes)("%s requires admin mode and selected workspace principal", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireAdminModeSession");
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it("pgCourses requires principal-aware mutation transactions and org stamps", () => {
    const src = readSource("src/infra/repos/pgCourses.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
  });

  it("pgReferences requires principal-aware SQL transactions and org stamps", () => {
    const src = readSource("src/infra/repos/pgReferences.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runWebappTransaction");
    expect(src).toContain("set_config('app.org'");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organization_id");
  });
});
