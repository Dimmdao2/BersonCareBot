/**
 * /app/doctor/patients — список пациентов врача.
 * Pattern: follows exercises/page.tsx (requireDoctorAccess → buildAppDeps → pass promise to Client).
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolvePatientTerms } from "@/modules/system-settings/patientTerms";
import { PatientsPageClient } from "./PatientsPageClient";

function getValueJson<T>(v: unknown, fallback: T): T {
  if (v !== null && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value as T;
  }
  return fallback;
}

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

  const displayIana = await getAppDisplayTimeZone();

  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor");
  const patientSingular = getValueJson(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");
  const { patientPluralLabel } = resolvePatientTerms(String(patientSingular));

  const listPromise = deps.doctorClients.listClients(
    {
      // PAT-10: search is done client-side — do not pass q to DB
      archivedOnly,
      viewerUserId: session.user.userId,
      // Segment filters
      supportStatus: segment === "on_support" ? "on" : undefined,
      hasActiveTreatmentProgram: segment === "with_program" ? true : undefined,
      visitedThisCalendarMonth: segment === "visited_month" ? true : undefined,
      hasMemberships: segment === "memberships" ? true : undefined,
      isNew: segment === "new" ? true : undefined,
      isFormer: segment === "former" ? true : undefined,
      isSubscriberOnly: segment === "subscriber" || segment === "without_appointments" ? true : undefined,
      hasCancellations: segment === "cancellations" ? true : undefined,
      hasUpcomingAppointment: segment === "appointments" ? true : undefined,
      // Channel filters
      hasTelegram: channel === "telegram" ? true : undefined,
      hasMax: channel === "max" ? true : undefined,
      hasEmail: channel === "email" ? true : undefined,
      hasPhone: channel === "phone" ? true : undefined,
      hasWebPush: channel === "web_push" ? true : undefined,
    },
  );

  const metricsPromise = deps.doctorClientsPort.getDashboardPatientMetrics();

  return (
    <DoctorAppShell title={patientPluralLabel} user={session.user} layout="full-height">
      <PatientsPageClient
        listPromise={listPromise}
        metricsPromise={metricsPromise}
        initialFilters={{ q, segment, channel, archivedOnly }}
        patientPluralLabel={patientPluralLabel}
        displayIana={displayIana}
      />
    </DoctorAppShell>
  );
}
