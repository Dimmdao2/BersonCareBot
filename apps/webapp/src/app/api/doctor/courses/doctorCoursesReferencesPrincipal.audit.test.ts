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
    expect(src).toContain('requireEntitlement(auth.ctx, "courses")');
  });

  it("guards every doctor course list, direct and usage read with the same workspace entitlement and principal", () => {
    const collection = readSource("src/app/api/doctor/courses/route.ts");
    const item = readSource("src/app/api/doctor/courses/[id]/route.ts");
    const usage = readSource("src/app/api/doctor/courses/[id]/usage/route.ts");
    for (const source of [collection, item, usage]) {
      expect(source).toContain("requireDoctorWorkspaceApiContext");
      expect(source).toContain('requireEntitlement(auth.ctx, "courses")');
      expect(source).toContain("withDoctorWorkspacePrincipal");
    }
  });

  it("hides course RSC entrypoints unless their trusted organization has the courses mechanic", () => {
    const doctorPages = [
      "src/app/app/doctor/courses/page.tsx",
      "src/app/app/doctor/courses/new/page.tsx",
      "src/app/app/doctor/courses/[id]/page.tsx",
    ];
    for (const file of doctorPages) {
      const source = readSource(file);
      expect(source).toContain("requireDoctorWorkspaceContext");
      expect(source).toContain('requireEntitlementForPage({ organizationId: workspace.organizationId }, "courses")');
      expect(source).not.toContain("assertMechanicEnabled(");
    }
    const patientPage = readSource("src/app/app/patient/courses/page.tsx");
    expect(patientPage).toContain("requirePatientAccessWithPhone");
    expect(patientPage).toContain("resolvePatientEnrollmentOrganizationId");
    expect(patientPage).toContain(
      'requireEntitlementForPage({ organizationId: patientOrganization.organizationId }, "courses")',
    );
    expect(patientPage).not.toContain("assertMechanicEnabled(");
    expect(patientPage).toContain("withPatientOrganizationPrincipal");
  });

  it("covers every current course consumer with a trusted principal and the courses entitlement where its projection or write is optional", () => {
    const optionalDoctorPickers = [
      "src/app/app/doctor/content/page.tsx",
      "src/app/app/doctor/content/new/page.tsx",
      "src/app/app/doctor/content/edit/[id]/page.tsx",
      "src/app/app/doctor/patient-home/page.tsx",
    ];
    for (const file of optionalDoctorPickers) {
      const source = readSource(file);
      expect(source).toContain('requireEntitlementForAction(workspace, "courses")');
      expect(source).toContain("withDoctorWorkspacePrincipal");
    }

    const patientProjections = [
      "src/app/app/patient/content/[slug]/PatientContentSlugArticle.tsx",
      "src/app/app/patient/sections/[slug]/page.tsx",
    ];
    for (const file of patientProjections) {
      const source = readSource(file);
      expect(source).toContain("resolvePatientEnrollmentOrganizationId");
      expect(source).toContain("requireEntitlementForAction(patientOrganization, \"courses\")");
      expect(source).toContain("withPatientOrganizationPrincipal");
    }

    const patientHomePage = readSource("src/app/app/patient/page.tsx");
    expect(patientHomePage).toContain("resolvePatientEnrollmentOrganizationId");
    expect(patientHomePage).toContain("requireEntitlementForAction(patientOrganization, \"courses\")");
    const patientHomeProjection = readSource("src/app/app/patient/home/PatientHomeToday.tsx");
    expect(patientHomeProjection).toContain("withPatientOrganizationPrincipal");

    const courseReferenceWrites = [
      "src/app/app/doctor/content/actions.ts",
      "src/app/app/settings/patient-home/actions.ts",
    ];
    for (const file of courseReferenceWrites) {
      const source = readSource(file);
      expect(source).toContain('requireEntitlementForAction(workspace, "courses")');
      expect(source).toContain("withDoctorWorkspacePrincipal");
    }

    const paymentFulfillment = readSource("src/app-layer/di/buildAppDeps.ts");
    expect(paymentFulfillment).toContain("payments.product-capture.fulfillment");
    expect(paymentFulfillment).toContain("withExplicitOrganizationPrincipal");
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
    expect(src).not.toContain("organizationReadCondition");
    expect(src).not.toContain("organization_id IS NULL");
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
