/**
 * Детальный просмотр пункта программы лечения (отдельная страница, не модалка).
 */
import { notFound, redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { routePaths } from "@/app-layer/routes/paths";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import {
  omitDisabledInstanceStageItemsForPatientApi,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import {
  parsePatientProgramItemNavMode,
  resolvePatientProgramItemPage,
} from "@/app/app/patient/treatment/patientProgramItemPageResolve";
import { flatTestSlots } from "@/app/app/patient/treatment/patientProgramItemNavLists";
import { parsePatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { PatientProgramStageItemPageClient } from "@/app/app/patient/treatment/PatientProgramStageItemPageClient";
import type { PatientTestSetPageServerSnapshot } from "@/modules/treatment-program/progress-service";
import { testTitleFromTestSetSnapshot } from "@/app/app/patient/treatment/stageItemSnapshot";

type Props = {
  params: Promise<{ instanceId: string; itemId: string }>;
  searchParams: Promise<{ nav?: string | string[]; planTab?: string | string[]; testId?: string | string[] }>;
};

function firstSearchParam(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") return raw[0];
  return "";
}

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
  const itemLinksPlanTab = parsePatientPlanTab(sp.planTab);
  const testIdQuery = firstSearchParam(sp.testId).trim();

  const deps = buildAppDeps();
  const appDisplayTimeZone = await getAppDisplayTimeZone();
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

  let resolvedTestIdForResolve: string | null = null;

  if (navMode === "tests") {
    const slots = flatTestSlots(currentWorkingStage);
    if (slots.length === 0) notFound();
    const byTestId = testIdQuery ? slots.find((s) => s.testId === testIdQuery) : undefined;
    const target = byTestId ?? slots[0]!;
    if (itemId !== target.itemId || testIdQuery !== target.testId) {
      redirect(
        routePaths.patientTreatmentProgramItem(instanceId, target.itemId, "tests", itemLinksPlanTab, target.testId),
      );
    }
    resolvedTestIdForResolve = target.testId;
  }

  const resolved = resolvePatientProgramItemPage({
    detail,
    itemId,
    nav: navMode,
    currentWorkingStage,
    testId: resolvedTestIdForResolve,
  });
  if (!resolved) notFound();

  let testSetServerSnapshot: PatientTestSetPageServerSnapshot = { variant: "none" };
  if (resolved.item.itemType === "test_set") {
    testSetServerSnapshot = await deps.treatmentProgramProgress.getPatientTestSetPageServerSnapshot({
      patientUserId: session.user.userId,
      instanceId,
      stageItemId: itemId,
    });
  }

  const title = (() => {
    if (navMode === "tests" && resolvedTestIdForResolve) {
      const snap = resolved.item.snapshot as Record<string, unknown>;
      const tt = testTitleFromTestSetSnapshot(snap, resolvedTestIdForResolve);
      if (tt) return tt;
    }
    const snap = resolved.item.snapshot as Record<string, unknown>;
    const t = snap.title;
    if (typeof t === "string" && t.trim() !== "") return t.trim();
    return resolved.item.itemType;
  })();

  const backHref = routePaths.patientTreatmentProgram(instanceId, itemLinksPlanTab);

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
        appDisplayTimeZone={appDisplayTimeZone}
        testSetServerSnapshot={testSetServerSnapshot}
        itemLinksPlanTab={itemLinksPlanTab}
        resolvedTestId={resolvedTestIdForResolve}
      />
    </AppShell>
  );
}
