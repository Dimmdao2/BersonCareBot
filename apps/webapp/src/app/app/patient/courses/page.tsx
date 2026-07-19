/**
 * Каталог курсов (§9): метаданные и цена; запись создаёт экземпляр программы как при назначении врача.
 */
import { notFound } from "next/navigation";
import { z } from "zod";
import { resolvePatientEnrollmentOrganizationId } from "@/app/api/booking/bookingTenant";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlementForPage } from "@/app-layer/guards/requireEntitlement";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { withPatientOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import { PatientCoursesCatalogClient } from "./PatientCoursesCatalogClient";

type PageProps = { searchParams: Promise<{ highlight?: string | string[] }> };

export default async function PatientCoursesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawHighlight = Array.isArray(sp.highlight) ? sp.highlight[0] : sp.highlight;
  const highlightCourseId =
    rawHighlight && z.string().uuid().safeParse(rawHighlight).success ? rawHighlight : undefined;
  const session = await requirePatientAccessWithPhone(routePaths.patientCourses);
  const deps = buildAppDeps();
  const patientOrganization = await resolvePatientEnrollmentOrganizationId(deps, session.user.userId);
  if (!patientOrganization.ok) notFound();
  await requireEntitlementForPage({ organizationId: patientOrganization.organizationId }, "courses");
  const items = await withPatientOrganizationPrincipal(
    {
      organizationId: patientOrganization.organizationId,
      platformUserId: session.user.userId,
      source: "app.patient.courses.catalog",
    },
    () => deps.courses.listPublishedCatalog(),
  );

  return (
    <PatientAppShell
      title="Курсы"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
     
    >
      <p className={cn(patientMutedTextClass, "mb-4")}>
        После записи вы получите программу лечения с этапами и материалами — как при назначении врача.
      </p>
      <PatientCoursesCatalogClient
        items={items}
        enrollReady
        loggedIn
        highlightCourseId={highlightCourseId}
      />
    </PatientAppShell>
  );
}
