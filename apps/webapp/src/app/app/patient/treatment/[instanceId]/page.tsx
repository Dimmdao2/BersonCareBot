/**
 * Прохождение программы лечения (`/app/patient/treatment/[instanceId]`).
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
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
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

  const initialTestResults = await deps.treatmentProgramProgress.listTestResultsForInstance(instanceId);
  const initialProgramEvents = await deps.treatmentProgramInstance.listProgramEvents(instanceId);

  let programDescription: string | null = null;
  if (detail.templateId) {
    try {
      const tpl = await deps.treatmentProgram.getTemplate(detail.templateId);
      const d = tpl.description?.trim();
      programDescription = d || null;
    } catch {
      programDescription = null;
    }
  }

  const patientIana = await deps.patientCalendarTimezone.getIanaForUser(session.user.userId);
  const resolvedIana = resolveCalendarDayIanaForPatient(patientIana, appTz);

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      backHref={routePaths.patientTreatmentPrograms}
      backLabel="Программы"
      variant="patient"
      patientSuppressShellTitle
    >
      <PatientTreatmentProgramDetailClient
        initial={detail}
        initialTestResults={initialTestResults}
        initialProgramEvents={initialProgramEvents}
        appDisplayTimeZone={appTz}
        programDescription={programDescription}
        patientCalendarDayIana={resolvedIana}
      />
    </AppShell>
  );
}
