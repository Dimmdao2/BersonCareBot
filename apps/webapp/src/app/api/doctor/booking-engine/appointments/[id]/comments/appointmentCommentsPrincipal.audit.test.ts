import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("doctor booking appointment comments principal coverage", () => {
  it("route uses selected workspace context and principal for comment writes", () => {
    const src = read("src/app/api/doctor/booking-engine/appointments/[id]/comments/route.ts");
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
    expect(src).toContain("gate.ctx.organizationId");
    expect(src).not.toContain("getDefaultOrganizationId");
  });

  it("pgClientHistory appointment comment insert is transaction-bound and principal-aware", () => {
    const src = read("src/infra/repos/pgClientHistory.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("currentWriteOrganizationId(input.organizationId)");
    expect(src).toContain(".insert(beAppointmentStaffComments)");
  });
});
