import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { notFound } from 'next/navigation';
import { parsePatientHomeDailyPracticeTarget } from '@/modules/patient-home/todayConfig';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { PatientHomeBlocksSettingsPageClient } from '@/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient';
import { PatientHomePracticeTargetPanel } from '@/app/app/settings/patient-home/PatientHomePracticeTargetPanel';
import { PatientHomeDailyWarmupRotationPanel } from '@/app/app/settings/patient-home/PatientHomeDailyWarmupRotationPanel';
import { PatientHomeRepeatCooldownPanel } from '@/app/app/settings/patient-home/PatientHomeRepeatCooldownPanel';
import {
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
  parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes,
} from '@/modules/patient-home/patientHomeRepeatCooldownSettings';
import {
  parsePatientHomeDailyWarmupRotationEnabled,
  parsePatientHomeDailyWarmupRotationTimes,
} from '@/modules/patient-home/patientHomeDailyWarmupRotationSettings';
import { buildPatientHomeRefDisplayTitles } from '@/modules/patient-home/patientHomeBlockItemDisplayTitle';
import {
  buildPatientHomeResolverSyncContext,
  computePatientHomeBlockRuntimeStatus,
  type PatientHomeBlockRuntimeStatus,
} from '@/modules/patient-home/patientHomeRuntimeStatus';

export default async function DoctorPatientHomeSettingsPage() {
  const workspace = await requireDoctorWorkspaceContext();
  const todayEntitlement = await requireEntitlementForReadAction(workspace, 'patient_home_today');
  if (!todayEntitlement.ok) notFound();
  const session = workspace.session;
  const isAdmin = session.user.role === 'admin';
  const canManagePatientHome = workspace.membershipRole === 'owner' || isAdmin;

  const deps = buildAppDeps();
  // P0.11.3: all settings read below are PER-ORG (see orgScopedKeys.ts) — org-first, global-fallback.
  const organizationId = workspace.organizationId;
  const coursesEnabled = (await requireEntitlementForReadAction(workspace, 'courses')).ok;
  const [
    blocks,
    pages,
    sections,
    courses,
    practiceSetting,
    warmupRotationEn,
    warmupRotationTimes,
    warmupCd,
    planCd,
  ] = await withDoctorWorkspacePrincipal(workspace, 'doctor.patient-home.read', () =>
    Promise.all([
      deps.patientHomeBlocks.listBlocksWithItems(),
      deps.contentPages.listAll(),
      deps.contentSections.listAll(),
      coursesEnabled
        ? deps.courses.listCoursesForDoctor({ includeArchived: true })
        : Promise.resolve([]),
      canManagePatientHome
        ? deps.systemSettings.getSetting('patient_home_daily_practice_target', 'admin', {
            organizationId,
          })
        : Promise.resolve(null),
      canManagePatientHome
        ? deps.systemSettings.getSetting('patient_home_daily_warmup_rotation_enabled', 'admin', {
            organizationId,
          })
        : Promise.resolve(null),
      canManagePatientHome
        ? deps.systemSettings.getSetting('patient_home_daily_warmup_rotation_times', 'admin', {
            organizationId,
          })
        : Promise.resolve(null),
      deps.systemSettings.getSetting('patient_home_daily_warmup_repeat_cooldown_minutes', 'admin', {
        organizationId,
      }),
      deps.systemSettings.getSetting(
        'patient_treatment_plan_item_done_repeat_cooldown_minutes',
        'admin',
        {
          organizationId,
        },
      ),
    ]),
  );
  const initialPracticeTarget = parsePatientHomeDailyPracticeTarget(
    practiceSetting?.valueJson ?? null,
  );
  const initialWarmupRotationEnabled = parsePatientHomeDailyWarmupRotationEnabled(
    warmupRotationEn?.valueJson ?? null,
  );
  const initialWarmupRotationTimes = parsePatientHomeDailyWarmupRotationTimes(
    warmupRotationTimes?.valueJson ?? null,
  );
  const initialWarmupRepeatMinutes = parsePatientHomeDailyWarmupRepeatCooldownMinutes(
    warmupCd?.valueJson ?? null,
  );
  const initialPlanItemRepeatMinutes = parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes(
    planCd?.valueJson ?? null,
  );

  const knownRefs = {
    contentPages: [...new Set(pages.map((p) => p.slug))],
    contentSections: [...new Set(sections.map((s) => s.slug))],
    courses: [...new Set(courses.map((c) => c.id))],
  };
  const refDisplayTitles = buildPatientHomeRefDisplayTitles({
    pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
    sections: sections.map((s) => ({ slug: s.slug, title: s.title })),
    courses: courses.map((c) => ({ id: c.id, title: c.title })),
  });

  const resolverSync = buildPatientHomeResolverSyncContext({
    sections: sections.map((s) => ({
      slug: s.slug,
      isVisible: s.isVisible,
      requiresAuth: s.requiresAuth,
      kind: s.kind,
      systemParentCode: s.systemParentCode,
    })),
    pages: pages.map((p) => ({
      slug: p.slug,
      requiresAuth: p.requiresAuth,
      section: p.section,
    })),
    courses: courses.map((c) => ({
      id: c.id,
      status: c.status,
    })),
  });

  const blockRuntimeStatuses: Record<string, PatientHomeBlockRuntimeStatus> = {};
  for (const b of blocks) {
    blockRuntimeStatuses[b.code] = computePatientHomeBlockRuntimeStatus(b, {
      knownRefs,
      resolverSync,
    });
  }

  return (
    <DoctorAppShell title="Главная пациента">
      <DoctorPageHeader title="Главная пациента" />
      {canManagePatientHome ? (
        <PatientHomePracticeTargetPanel initialTarget={initialPracticeTarget} />
      ) : null}
      <PatientHomeRepeatCooldownPanel
        initialWarmupMinutes={initialWarmupRepeatMinutes}
        initialPlanItemMinutes={initialPlanItemRepeatMinutes}
      />
      {canManagePatientHome ? (
        <div className="flex flex-col gap-3">
          <PatientHomeDailyWarmupRotationPanel
            initialEnabled={initialWarmupRotationEnabled}
            initialTimes={initialWarmupRotationTimes}
          />
        </div>
      ) : null}
      <PatientHomeBlocksSettingsPageClient
        initialBlocks={blocks}
        knownRefs={knownRefs}
        refDisplayTitles={refDisplayTitles}
        blockRuntimeStatuses={blockRuntimeStatuses}
      />
    </DoctorAppShell>
  );
}
