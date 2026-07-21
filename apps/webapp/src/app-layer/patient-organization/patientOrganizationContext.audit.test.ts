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
    expect(auth).toContain('stampDbPrincipalFromSession(normalized, "getCurrentSession", patientOrganizationHint)');
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
    expect(organizationUi).toContain("window.location.replace");
    expect(organizationUi).not.toContain("window.location.reload");
    expect(organizationUi).not.toContain("organizationChanged");
    expect(organizationUi).toContain("contextChangeNotice");
  });

  it("runs Today and reminder go-targets under the selected patient organization principal", () => {
    const page = source("src/app/app/patient/page.tsx");
    const today = source("src/app/app/patient/home/PatientHomeToday.tsx");
    const go = source("src/app/app/patient/go/[kind]/page.tsx");
    expect(page).toContain("stampPatientOrganizationRequestContext");
    expect(page).toContain('source: "app.patient.page"');
    expect(page).toContain("organizationId: patientContext.organizationId");
    expect(page).not.toContain("resolvePatientEnrollmentOrganizationId");
    expect(today).toContain("withPatientOrganizationPrincipal");
    expect(today).toContain('source: "app.patient.home.today"');
    expect(go).toContain("resolvePatientOrganizationRequestContext");
    expect(go).toContain("verifiedTargetOrganizationId: reminderOrganizationId");
    expect(go).toContain("buildPatientReminderOrganizationOpener");
    expect(go).toContain('source: "app.patient.go.daily-warmup"');
    expect(go).toContain('source: "app.patient.go.plan-start-lesson"');
  });

  it("binds both reminder delivery paths to the occurrence organization", () => {
    const webScheduler = source("src/modules/reminders/webPushOnlyScheduler.ts");
    const webBuilder = source("src/modules/reminders/buildReminderDeepLink.ts");
    const integratorHandler = source("../../apps/integrator/src/kernel/domain/executor/handlers/reminders.ts");
    const integratorBuilder = source(
      "../../apps/integrator/src/kernel/domain/reminders/buildPatientReminderDeepLink.ts",
    );
    expect(webScheduler).toContain("targetOrganizationId: occ.organizationId");
    expect(webBuilder).toContain("organizationId?: string | null");
    expect(integratorHandler).toContain("organizationId: occurrenceOrganizationId");
    expect(integratorHandler).toContain("computedOpenIsOrganizationGo");
    expect(integratorBuilder).toContain("organizationId?: string | null | undefined");
  });

  it("exposes a canonical patient relationship surface from Profile", () => {
    const paths = source("src/app-layer/routes/paths.ts");
    const profile = source("src/app/app/patient/profile/page.tsx");
    const organizations = source("src/app/app/patient/organizations/page.tsx");
    expect(paths).toContain('patientOrganizations: "/app/patient/organizations"');
    expect(profile).toContain("routePaths.patientOrganizations");
    expect(organizations).toContain("PatientOrganizationRelationships");
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
    expect(opener).toContain("PATIENT_ORGANIZATION_CHANGE_RECEIPT_COOKIE");
    expect(opener).toContain("resolved.organizationId");
  });

  it("keeps booking resolution on the already server-resolved principal context", () => {
    const tenant = source("src/app/api/booking/bookingTenant.ts");
    expect(tenant).toContain("getCurrentDbPrincipalOrganizationId");
    expect(tenant).toContain("rememberedOrganizationId");
  });

  it("keeps locked patient organization reads behind exact capability ACLs", () => {
    const overlay = source("../../deploy/postgres/e1-webapp-runtime-config.sql");
    const entitlementCapability = source("db/drizzle-migrations/0219_current_patient_organization_entitlements.sql");
    const commercialCapability = source("db/drizzle-migrations/0223_saas_tariff_quotas_trial.sql");
    const entitlementRepository = source("src/infra/repos/pgOrgEntitlements.ts");
    expect(overlay).toContain("ALTER FUNCTION app.read_current_patient_active_organizations() OWNER TO app_owner");
    expect(overlay).toContain("GRANT EXECUTE ON FUNCTION app.read_current_patient_active_organizations()");
    expect(overlay).toContain("app.resolve_current_patient_treatment_program_organization(uuid)");
    expect(overlay).toContain("NOT has_table_privilege('app_patient','public.be_organizations','SELECT')");
    expect(overlay).toContain("app.read_current_patient_organization_entitlements()");
    expect(overlay).toContain("NOT has_table_privilege('app_patient','public.saas_tariffs','SELECT')");
    expect(overlay).toContain("NOT has_table_privilege('app_patient','public.saas_org_entitlement_overrides','SELECT')");
    expect(entitlementCapability).toContain("v_organization_id uuid := app.current_org_id()");
    expect(entitlementCapability).toContain("v_patient_user_id uuid := app.current_patient_user_id()");
    expect(entitlementCapability).toContain("enrollment.organization_id = v_organization_id");
    expect(entitlementCapability).toContain("enrollment.platform_user_id = v_patient_user_id");
    expect(entitlementCapability).toContain("enrollment.status = 'active'");
    expect(commercialCapability).toContain("DROP FUNCTION IF EXISTS app.read_current_patient_organization_entitlements()");
    expect(commercialCapability).toContain("override_expires_at timestamptz");
    expect(commercialCapability).toContain("trial.status = 'active'");
    expect(commercialCapability).toContain("WHEN v_now <= trial.grace_ends_at THEN 'grace'");
    expect(commercialCapability).toContain("WHEN trial.post_trial_behavior = 'tariff' THEN trial.post_trial_tariff_id");
    expect(commercialCapability).toContain("entitlement_override.expires_at > v_now");
    expect(entitlementRepository).toContain("patient_entitlement_organization_mismatch");
    expect(entitlementRepository).toContain("patient_entitlement_context_denied");
    expect(entitlementRepository).toContain("SELECT * FROM app.read_current_patient_organization_entitlements()");
  });
});
