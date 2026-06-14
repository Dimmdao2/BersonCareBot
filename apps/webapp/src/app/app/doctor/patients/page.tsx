/**
 * /app/doctor/patients — список пациентов врача.
 * Pattern: follows exercises/page.tsx (requireDoctorAccess → buildAppDeps → pass promise to Client).
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { PatientsPageClient } from "./PatientsPageClient";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    segment?: string;
    channel?: string;
    archived?: string;
  }>;
};

export default async function DoctorPatientsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const segment = typeof sp.segment === "string" ? sp.segment : null;
  const channel = typeof sp.channel === "string" ? sp.channel : null;
  const archivedOnly = sp.archived === "true";

  const deps = buildAppDeps();

  const listPromise = deps.doctorClients.listClients(
    {
      search: q || undefined,
      archivedOnly,
      viewerUserId: session.user.userId,
      // Segment filters
      supportStatus: segment === "on_support" ? "on" : undefined,
      hasActiveTreatmentProgram: segment === "with_program" ? true : undefined,
      visitedThisCalendarMonth: segment === "visited_month" ? true : undefined,
      hasMemberships: segment === "memberships" ? true : undefined,
      isNew: segment === "new" ? true : undefined,
      isFormer: segment === "former" ? true : undefined,
      isSubscriberOnly: segment === "subscriber" ? true : undefined,
      hasCancellations: segment === "cancellations" ? true : undefined,
      // Channel filters
      hasTelegram: channel === "telegram" ? true : undefined,
      hasMax: channel === "max" ? true : undefined,
      hasEmail: channel === "email" ? true : undefined,
      hasPhone: channel === "phone" ? true : undefined,
    },
  );

  const metricsPromise = deps.doctorClientsPort.getDashboardPatientMetrics();

  return (
    <DoctorAppShell title="Пациенты" user={session.user}>
      <PatientsPageClient
        listPromise={listPromise}
        metricsPromise={metricsPromise}
        initialFilters={{ q, segment, channel, archivedOnly }}
      />
    </DoctorAppShell>
  );
}
