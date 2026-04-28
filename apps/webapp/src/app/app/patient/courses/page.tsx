/**
 * Каталог курсов (§9): метаданные и цена; запись создаёт экземпляр программы как при назначении врача.
 */
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { patientClientBusinessGate } from "@/modules/platform-access/patientClientBusinessGate";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientCoursesCatalogClient } from "./PatientCoursesCatalogClient";

type PageProps = { searchParams: Promise<{ highlight?: string | string[] }> };

export default async function PatientCoursesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawHighlight = Array.isArray(sp.highlight) ? sp.highlight[0] : sp.highlight;
  const highlightCourseId =
    rawHighlight && z.string().uuid().safeParse(rawHighlight).success ? rawHighlight : undefined;
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();
  const items = await deps.courses.listPublishedCatalog();

  let enrollReady = false;
  let loggedIn = false;
  if (session) {
    loggedIn = true;
    const g = await patientClientBusinessGate(session);
    enrollReady = g === "allow";
  }

  return (
    <AppShell
      title="Курсы"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        После записи вы получите программу лечения с этапами и материалами — как при назначении врача.
      </p>
      <PatientCoursesCatalogClient
        items={items}
        enrollReady={enrollReady}
        loggedIn={loggedIn}
        highlightCourseId={highlightCourseId}
      />
    </AppShell>
  );
}
