import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webappRoot = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(webappRoot, path), "utf8");
}

describe("U5A patient organization context wiring", () => {
  it("treats the remembered organization as a server-revalidated hint at the auth chokepoint", () => {
    const auth = source("src/modules/auth/service.ts");
    const stamp = source("src/app-layer/principal/sessionPrincipal.ts");
    expect(auth).toContain("PATIENT_ORGANIZATION_PREFERENCE_COOKIE");
    expect(auth).toContain("stampDbPrincipalFromSession(normalized, \"getCurrentSession\", patientOrganizationHint)");
    expect(stamp).toContain("rememberedOrganizationId: patientOrganizationHint");
    expect(stamp).toContain("patient-enrollment-resolution");
  });

  it("blocks care rendering on zero/ambiguous context and exposes the authorized context in the shell", () => {
    const layout = source("src/app/app/patient/layout.tsx");
    const shell = source("src/shared/ui/patient/shell/PatientBottomShellFrame.tsx");
    const organizationUi = source("src/shared/ui/patient/organization/PatientOrganizationContext.tsx");
    expect(layout).toContain("PatientOrganizationRecoveryScreen");
    expect(layout).toContain("stampPatientOrganizationRequestContext");
    expect(layout).toContain("organizationContext={patientContext}");
    expect(shell).toContain("PatientOrganizationContextBar");
    expect(organizationUi).toContain('from "@/shared/ui/patient/primitives/button"');
    expect(organizationUi).toContain('from "@/shared/ui/patient/primitives/select"');
    expect(organizationUi).not.toContain("<select");
    expect(organizationUi).not.toContain("<button");
  });

  it("runs Today and reminder go-targets under the selected patient organization principal", () => {
    const today = source("src/app/app/patient/home/PatientHomeToday.tsx");
    const go = source("src/app/app/patient/go/[kind]/page.tsx");
    expect(today).toContain("withPatientOrganizationPrincipal");
    expect(today).toContain('source: "app.patient.home.today"');
    expect(go).toContain("resolvePatientOrganizationRequestContext");
    expect(go).toContain('source: "app.patient.go.daily-warmup"');
    expect(go).toContain('source: "app.patient.go.plan-start-lesson"');
  });

  it("maps treatment object links to an enrolled organization before changing visible context", () => {
    const service = source("src/modules/patient-organization/service.ts");
    const repository = source("src/infra/repos/pgPatientOrganization.ts");
    const capability = source("db/drizzle-migrations/0216_current_patient_organization_context.sql");
    const program = source("src/app/app/patient/treatment/[instanceId]/page.tsx");
    const item = source("src/app/app/patient/treatment/[instanceId]/item/[itemId]/page.tsx");
    const opener = source("src/app/api/patient/organization-context/open/route.ts");
    expect(service).toContain("findTreatmentProgramOrganizationForPatient");
    expect(repository).toContain("app.read_current_patient_active_organizations()");
    expect(repository).toContain("app.resolve_current_patient_treatment_program_organization");
    expect(repository).not.toContain("beOrganizations");
    expect(capability).toContain("v_patient_user_id uuid := app.current_patient_user_id()");
    expect(capability).toContain("instance.patient_user_id = v_patient_user_id");
    expect(capability).toContain("enrollment.status = 'active'");
    expect(capability).toContain("organization.is_active = true");
    expect(program).toContain("resolveTreatmentProgramOrganizationForPatient");
    expect(item).toContain("resolveTreatmentProgramOrganizationForPatient");
    expect(opener).toContain("PATIENT_ORGANIZATION_PREFERENCE_COOKIE");
    expect(opener).toContain("resolved.organizationId");
  });

  it("keeps booking resolution on the already server-resolved principal context", () => {
    const tenant = source("src/app/api/booking/bookingTenant.ts");
    expect(tenant).toContain("getCurrentDbPrincipalOrganizationId");
    expect(tenant).toContain("rememberedOrganizationId");
  });

  it("keeps locked patient organization reads behind exact capability ACLs", () => {
    const overlay = source("../../deploy/postgres/e1-webapp-runtime-config.sql");
    expect(overlay).toContain("ALTER FUNCTION app.read_current_patient_active_organizations() OWNER TO app_owner");
    expect(overlay).toContain("GRANT EXECUTE ON FUNCTION app.read_current_patient_active_organizations()");
    expect(overlay).toContain("app.resolve_current_patient_treatment_program_organization(uuid)");
    expect(overlay).toContain("NOT has_table_privilege('app_patient','public.be_organizations','SELECT')");
  });
});
