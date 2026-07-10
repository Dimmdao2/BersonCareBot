import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAAS Hole#3 (taskdb `#645`): the admin appointment-records soft-delete route used to gate only
 * on `session.user.role === "admin"` and wrote the SCOPED `appointment_records` / `patient_bookings`
 * rows via `appointmentProjection.softDeleteByIntegratorId` with no organization predicate — any
 * admin could soft-delete any other organization's record. This audit locks the fix in place:
 * the route resolves an admin workspace principal and threads `organizationId` into the port call,
 * and the port refuses cross-organization deletes for records with a resolvable canonical org.
 */

const ROUTE_FILE = "src/app/api/admin/appointment-records/[integratorRecordId]/soft-delete/route.ts";
const REPO_FILE = "src/infra/repos/pgAppointmentProjection.ts";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin appointment-records soft-delete workspace principal cutover", () => {
  it("resolves an admin workspace context instead of a bare role check", () => {
    const src = readSource(ROUTE_FILE);
    expect(src).toContain("requireAdminWorkspaceApiContext");
    expect(src).not.toMatch(/session\.user\.role\s*!==\s*["']admin["']/);
    expect(src).not.toContain("getCurrentSession");
  });

  it("wraps the soft-delete mutation in the doctor workspace principal and passes organizationId", () => {
    const src = readSource(ROUTE_FILE);
    expect(src).toContain("withDoctorWorkspacePrincipal");
    expect(src).toContain("gate.ctx");
    expect(src).toContain("organizationId: gate.ctx.organizationId");
    expect(src).toMatch(
      /withDoctorWorkspacePrincipal\(gate\.ctx,\s*"admin\.appointment-records\.soft-delete",\s*\(\)\s*=>\s*[\s\S]*?softDeleteByIntegratorId\(id,\s*\{\s*organizationId:\s*gate\.ctx\.organizationId\s*\}\)/,
    );
  });

  it("softDeleteByIntegratorId accepts an organizationId guard and refuses cross-organization deletes", () => {
    const src = readSource(REPO_FILE);
    expect(src).toContain("organizationId?: string");
    expect(src).toContain("resolveLegacyAppointmentOrganizationId");
    expect(src).toContain("AppointmentProjectionOrganizationMismatchError");
    // Guard resolves canonical org via be_appointments / be_external_entity_mappings — legacy
    // appointment_records/patient_bookings tables get no organization_id column (T0.4 ADR).
    expect(src).toContain("be_appointments");
    expect(src).toContain("be_external_entity_mappings");
  });

  it("does not add an organization_id column predicate onto the legacy appointment_records/patient_bookings writes", () => {
    const src = readSource(REPO_FILE);
    // The legacy tables have no organization_id column (T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md);
    // guard the intent so a future edit doesn't silently invent one on the UPDATE/DELETE statements.
    expect(src).not.toMatch(/UPDATE appointment_records[\s\S]*?organization_id\s*=/);
    expect(src).not.toMatch(/DELETE FROM patient_bookings[\s\S]*?organization_id\s*=/);
  });

  it("the organization mismatch and not-found paths both resolve to a safe false return", () => {
    const src = readSource(REPO_FILE);
    expect(src).toMatch(
      /err instanceof AppointmentProjectionRecordNotFoundError\s*\|\|\s*\n?\s*err instanceof AppointmentProjectionOrganizationMismatchError/,
    );
  });
});
