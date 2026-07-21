import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlementForRead } from "@/app-layer/guards/requireEntitlement";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { resolvePatientEnrollmentOrganizationId } from "@/app/api/booking/bookingTenant";
import { withPatientOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * Курсы, назначенные ТЕКУЩЕМУ пациенту через его собственную программу (совпадение `template_id`
 * его `treatment_program_instances` с `program_template_id` курса) — НЕ публичный каталог/
 * маркетплейс. Полная витрина — отдельная будущая задача (taskdb #724); здесь только «своё».
 */
export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  const patientOrganization = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!patientOrganization.ok) return patientOrganization.response;
  const entitlement = await requireEntitlementForRead({ organizationId: patientOrganization.organizationId }, "courses");
  if (!entitlement.ok) return entitlement.response;
  const items = await withPatientOrganizationPrincipal(
    {
      organizationId: patientOrganization.organizationId,
      platformUserId: gate.session.user.userId,
      source: "patient.courses.list",
    },
    () => deps.courses.listAssignedForPatient(gate.session.user.userId),
  );
  return NextResponse.json({ ok: true, items });
}
