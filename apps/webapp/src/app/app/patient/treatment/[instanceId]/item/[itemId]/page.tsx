/**
 * Детальный просмотр пункта программы лечения (отдельная страница, не модалка).
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import {
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import {
  parsePatientProgramItemNavMode,
  resolvePatientProgramItemPage,
} from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { PatientProgramStageItemPageClient } from "@/app/app/patient/treatment/PatientProgramStageItemPageClient";

type Props = {
  params: Promise<{ instanceId: string; itemId: string }>;
  searchParams: Promise<{ nav?: string | string[] }>;
};

export default async function PatientTreatmentProgramItemPage({ params, searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Пункт программы" user={null} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className={patientMutedTextClass}>Войдите для доступа.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Пункт программы" user={session.user} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const { instanceId, itemId } = await params;
  const sp = await searchParams;
  const navMode = parsePatientProgramItemNavMode(sp.nav);

  const deps = buildAppDeps();
  let detail;
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

  const { pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  const currentWorkingStage = selectCurrentWorkingStageForPatientDetail(pipeline);

  const resolved = resolvePatientProgramItemPage({
    detail,
    itemId,
    nav: navMode,
    currentWorkingStage,
  });
  if (!resolved) notFound();

  const title = (() => {
    const snap = resolved.item.snapshot as Record<string, unknown>;
    const t = snap.title;
    if (typeof t === "string" && t.trim() !== "") return t.trim();
    return resolved.item.itemType;
  })();

  const backHref = routePaths.patientTreatmentProgram(instanceId);

  return (
    <AppShell
      title={title}
      user={session.user}
      backHref={backHref}
      backLabel="План"
      variant="patient"
      patientSuppressShellTitle
    >
      <PatientProgramStageItemPageClient
        instanceId={instanceId}
        itemId={itemId}
        navMode={navMode}
        backHref={backHref}
        initialDetail={detail}
      />
    </AppShell>
  );
}
