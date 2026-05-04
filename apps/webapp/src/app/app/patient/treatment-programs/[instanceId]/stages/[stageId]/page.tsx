/**
 * Детальная страница этапа программы лечения (`/app/patient/treatment-programs/[instanceId]/stages/[stageId]`).
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import { PatientTreatmentProgramStagePageClient } from "../../../PatientTreatmentProgramStagePageClient";

type Props = { params: Promise<{ instanceId: string; stageId: string }> };

export default async function PatientTreatmentProgramStagePage({ params }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell
        title="Этап программы"
        user={null}
        backHref={routePaths.patientTreatmentPrograms}
        backLabel="Программы"
        variant="patient"
      >
        <p className={patientMutedTextClass}>Войдите для доступа.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell
        title="Этап программы"
        user={session.user}
        backHref={routePaths.patientTreatmentPrograms}
        backLabel="Программы"
        variant="patient"
      >
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const { instanceId, stageId } = await params;
  const deps = buildAppDeps();

  let detail: Awaited<ReturnType<typeof deps.treatmentProgramInstance.getInstanceForPatient>>;
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

  const resolvedDetail = detail as NonNullable<typeof detail>;
  const stage = resolvedDetail.stages.find((s) => s.id === stageId);
  if (!stage) notFound();

  const pipelineLength = resolvedDetail.stages.filter((s) => s.sortOrder > 0).length;

  const stageLabel =
    stage.sortOrder === 0
      ? "Общие рекомендации"
      : `Этап ${stage.sortOrder} · ${stage.title}`;

  return (
    <AppShell
      title={stageLabel}
      user={session.user}
      backHref={routePaths.patientTreatmentProgram(instanceId)}
      backLabel="Программа"
      variant="patient"
    >
      <PatientTreatmentProgramStagePageClient
        instanceId={instanceId}
        stage={stage}
        pipelineLength={pipelineLength}
      />
    </AppShell>
  );
}
