import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adminAuditRouteFiles = [
  "src/app/api/admin/audit-log/route.ts",
  "src/app/api/admin/audit-log/resolve/route.ts",
] as const;

const adminOpsAuditWriteRouteFiles = [
  "src/app/api/admin/users/[userId]/profile/route.ts",
  "src/app/api/admin/health-failure-archive/clear/route.ts",
  "src/app/api/admin/operator-incidents/resolve-all/route.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin audit log workspace principal cutover", () => {
  it.each(adminAuditRouteFiles)("%s requires selected workspace and runs audit work under principal", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireAdminModeSession");
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it.each(adminOpsAuditWriteRouteFiles)("%s writes admin audit rows under selected workspace principal", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
    expect(src).toContain("writeAuditLog");
  });

  it("central admin audit log stamps and filters by db principal organization", () => {
    const src = readSource("src/infra/adminAuditLog.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("currentAuditOrganizationId");
    expect(src).toContain("organization_id, actor_id, action");
    expect(src).toContain("l.organization_id = $");
    expect(src).toContain("organization_id = $1::uuid");
    expect(src).toContain("organization_id = $2::uuid");
    expect(src).toContain("organization_id = $3::uuid");
  });
});
