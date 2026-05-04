/**
 * Список назначенных программ лечения (`/app/patient/treatment-programs`).
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";
import {
  PatientTreatmentProgramsListClient,
  patientProgramsListCurrentStageTitle,
  type PatientTreatmentProgramsListHero,
} from "./PatientTreatmentProgramsListClient";

export default async function PatientTreatmentProgramsPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программы лечения" user={null} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Войдите, чтобы увидеть назначенные программы.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программы лечения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const deps = buildAppDeps();
  const appTz = await getAppDisplayTimeZone();
  const list = await deps.treatmentProgramInstance.listForPatient(session.user.userId);

  const activeCandidates = list
    .filter((p) => p.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const activeSummary = activeCandidates[0] ?? null;

  const archived = list
    .filter((p) => p.status === "completed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));

  let hero: PatientTreatmentProgramsListHero | null = null;
  if (activeSummary) {
    let currentStageTitle: string | null = null;
    try {
      const detail = await deps.treatmentProgramInstance.getInstanceForPatient(
        session.user.userId,
        activeSummary.id,
      );
      currentStageTitle = patientProgramsListCurrentStageTitle(detail);
    } catch {
      currentStageTitle = null;
    }

    let planUpdatedLabel: string | null = null;
    try {
      const nudge = await deps.treatmentProgramInstance.patientPlanUpdatedBadgeForInstance({
        patientUserId: session.user.userId,
        instanceId: activeSummary.id,
      });
      if (nudge.show && nudge.eventIso) {
        planUpdatedLabel = `План обновлён ${formatBookingDateLongRu(nudge.eventIso, appTz)}`;
      } else if (nudge.show) {
        planUpdatedLabel = "План обновлён";
      }
    } catch {
      planUpdatedLabel = null;
    }

    hero = {
      instanceId: activeSummary.id,
      title: activeSummary.title,
      currentStageTitle,
      planUpdatedLabel,
    };
  }

  return (
    <AppShell title="Программы лечения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <PatientTreatmentProgramsListClient
        hero={hero}
        archived={archived}
        messagesHref={routePaths.patientMessages}
      />
    </AppShell>
  );
}
