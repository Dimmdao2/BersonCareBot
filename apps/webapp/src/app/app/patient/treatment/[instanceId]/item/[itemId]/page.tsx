/**
 * Детальный просмотр пункта программы лечения (отдельная страница, не модалка).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { routePaths } from '@/app-layer/routes/paths';
import {
  getOptionalPatientSession,
  patientRscPersonalDataGate,
} from '@/app-layer/guards/requireRole';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import {
  omitDisabledInstanceStageItemsForPatientApi,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from '@/modules/treatment-program/stage-semantics';
import {
  parsePatientProgramItemNavMode,
  resolvePatientProgramItemPage,
} from '@/app/app/patient/treatment/patientProgramItemPageResolve';
import { flatTestSlots } from '@/app/app/patient/treatment/patientProgramItemNavLists';
import { parsePatientPlanTab } from '@/app/app/patient/treatment/patientPlanTab';
import { PatientProgramStageItemPageClient } from '@/app/app/patient/treatment/PatientProgramStageItemPageClient';
import type { PatientTestSetPageServerSnapshot } from '@/modules/treatment-program/progress-service';
import { testTitleFromTestSetSnapshot } from '@/app/app/patient/treatment/stageItemSnapshot';
import { loadPatientProgramInteractionBundle } from '@/app/app/patient/treatment/loadPatientProgramInteractionBundle';
import { getMechanicSurfaceVisibility } from '@/app-layer/guards/requireEntitlement';

type Props = {
  params: Promise<{ instanceId: string; itemId: string }>;
  searchParams: Promise<{
    nav?: string | string[];
    planTab?: string | string[];
    testId?: string | string[];
  }>;
};

function firstSearchParam(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw[0];
  return '';
}

export default async function PatientTreatmentProgramItemPage({ params, searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <PatientAppShell
        title="Пункт программы"
        user={null}
        backHref={routePaths.patientTreatmentPrograms}
        backLabel="Программы"
      >
        <p className={patientMutedTextClass}>Войдите для доступа.</p>
      </PatientAppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === 'guest') {
    return (
      <PatientAppShell
        title="Пункт программы"
        user={session.user}
        backHref={routePaths.patientTreatmentPrograms}
        backLabel="Программы"
      >
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </PatientAppShell>
    );
  }

  const { instanceId, itemId } = await params;
  const sp = await searchParams;
  const navMode = parsePatientProgramItemNavMode(sp.nav);
  const itemLinksPlanTab = parsePatientPlanTab(sp.planTab);
  const testIdQuery = firstSearchParam(sp.testId).trim();

  const deps = buildAppDeps();
  const targetContext =
    await deps.patientOrganization?.resolveTreatmentProgramOrganizationForPatient(
      session.user.userId,
      instanceId,
    );
  if (!targetContext?.ok) notFound();
  if (getCurrentDbPrincipalOrganizationId() !== targetContext.organizationId) {
    redirect(
      `/api/patient/organization-context/open?kind=treatment_program_item&instanceId=${encodeURIComponent(instanceId)}&itemId=${encodeURIComponent(itemId)}`,
    );
  }
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  let detail;
  let planItemDoneRepeatCooldownMinutes = 60;
  let programCommentsInteraction = { visible: false, enabled: false };
  let programMediaInteraction = { visible: false, enabled: false };
  try {
    const rawDetail = await deps.treatmentProgramInstance.getInstanceForPatient(
      session.user.userId,
      instanceId,
    );
    if (!rawDetail) notFound();
    detail = omitDisabledInstanceStageItemsForPatientApi(rawDetail);
    const organizationId = detail.organizationId?.trim();
    if (!organizationId) notFound();
    if (detail.assignmentSource === 'promo') {
      const promoVisibility = await getMechanicSurfaceVisibility({ organizationId }, 'promo');
      if (!promoVisibility.directUrl) notFound();
    }
    const [cooldown, interaction] = await Promise.all([
      deps.runtimeConfig.getInteger('patient_treatment_plan_item_done_repeat_cooldown_minutes', {
        patientUserId: session.user.userId,
        organizationId,
      }),
      loadPatientProgramInteractionBundle(
        deps,
        session.user.userId,
        organizationId,
        detail.assignmentSource,
      ),
    ]);
    planItemDoneRepeatCooldownMinutes = cooldown;
    programCommentsInteraction = interaction.comments;
    programMediaInteraction = interaction.media;
  } catch {
    notFound();
  }

  const { pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  const currentWorkingStage = selectCurrentWorkingStageForPatientDetail(pipeline);

  let resolvedTestIdForResolve: string | null = null;

  if (navMode === 'tests') {
    const slots = flatTestSlots(currentWorkingStage);
    if (slots.length === 0) notFound();
    const byTestId = testIdQuery ? slots.find((s) => s.testId === testIdQuery) : undefined;
    const target = byTestId ?? slots[0]!;
    if (itemId !== target.itemId || testIdQuery !== target.testId) {
      redirect(
        routePaths.patientTreatmentProgramItem(
          instanceId,
          target.itemId,
          'tests',
          itemLinksPlanTab,
          target.testId,
        ),
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

  let testSetServerSnapshot: PatientTestSetPageServerSnapshot = { variant: 'none' };
  if (resolved.item.itemType === 'clinical_test') {
    testSetServerSnapshot = await deps.treatmentProgramProgress.getPatientTestSetPageServerSnapshot(
      {
        patientUserId: session.user.userId,
        instanceId,
        stageItemId: itemId,
      },
    );
  }

  const title = (() => {
    if (navMode === 'tests' && resolvedTestIdForResolve) {
      const snap = resolved.item.snapshot as Record<string, unknown>;
      const tt = testTitleFromTestSetSnapshot(snap, resolvedTestIdForResolve);
      if (tt) return tt;
    }
    const snap = resolved.item.snapshot as Record<string, unknown>;
    const t = snap.title;
    if (typeof t === 'string' && t.trim() !== '') return t.trim();
    return resolved.item.itemType;
  })();

  const backHref = routePaths.patientTreatmentProgram(instanceId, itemLinksPlanTab);

  return (
    <PatientAppShell
      title={title}
      user={session.user}
      backHref={backHref}
      backLabel="План"
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
        planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}
        programCommentsInteraction={programCommentsInteraction}
        programMediaInteraction={programMediaInteraction}
      />
    </PatientAppShell>
  );
}
