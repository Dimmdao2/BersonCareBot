/**
 * Прохождение программы лечения (`/app/patient/treatment-programs/[instanceId]`).
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";
import { PatientTreatmentProgramDetailClient } from "../PatientTreatmentProgramDetailClient";

type Props = { params: Promise<{ instanceId: string }> };

export default async function PatientTreatmentProgramDetailPage({ params }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программа" user={null} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className={patientMutedTextClass}>Войдите для доступа.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программа" user={session.user} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const { instanceId } = await params;
  const deps = buildAppDeps();
  const appTz = await getAppDisplayTimeZone();
  let detail: TreatmentProgramInstanceDetail;
  try {
    const rawDetail = await deps.treatmentProgramInstance.getInstanceForPatient(
      session.user.userId,
      instanceId,
    );
    if (!rawDetail) notFound();
    detail = omitDisabledInstanceStageItemsForPatientApi(rawDetail);
  } catch {
    notFound();
  }

  /** Ошибка nudge не должна превращать страницу в 404 при валидном экземпляре. */
  let planUpdatedLabel: string | null = null;
  try {
    const nudge = await deps.treatmentProgramInstance.patientPlanUpdatedBadgeForInstance({
      patientUserId: session.user.userId,
      instanceId,
    });
    if (nudge.show && nudge.eventIso) {
      planUpdatedLabel = `План обновлён ${formatBookingDateLongRu(nudge.eventIso, appTz)}`;
    } else if (nudge.show) {
      planUpdatedLabel = "План обновлён";
    }
  } catch {
    planUpdatedLabel = null;
  }

  const initialTestResults = await deps.treatmentProgramProgress.listTestResultsForInstance(instanceId);

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      backHref={routePaths.patientTreatmentPrograms}
      backLabel="Программы"
      variant="patient"
    >
      <PatientTreatmentProgramDetailClient
        initial={detail}
        initialTestResults={initialTestResults}
        appDisplayTimeZone={appTz}
        planUpdatedLabel={planUpdatedLabel}
      />
    </AppShell>
  );
}
