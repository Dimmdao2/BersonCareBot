import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { PatientHomeBlocksSettingsPageClient } from "@/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient";
import { PatientHomePracticeTargetPanel } from "@/app/app/settings/patient-home/PatientHomePracticeTargetPanel";
import { PatientHomeDailyWarmupRotationPanel } from "@/app/app/settings/patient-home/PatientHomeDailyWarmupRotationPanel";
import { PatientHomeMorningPingPanel } from "@/app/app/settings/patient-home/PatientHomeMorningPingPanel";
import { PatientHomeRepeatCooldownPanel } from "@/app/app/settings/patient-home/PatientHomeRepeatCooldownPanel";
import { PatientHomeMoodIconsPanel } from "./PatientHomeMoodIconsPanel";
import { parsePatientHomeMoodIcons } from "@/modules/patient-home/patientHomeMoodIcons";
import {
  parsePatientHomeDailyWarmupRepeatCooldownMinutes,
  parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";
import {
  parsePatientHomeMorningPingEnabled,
  parsePatientHomeMorningPingLocalTime,
} from "@/modules/patient-home/patientHomeMorningPingSettings";
import {
  parsePatientHomeDailyWarmupRotationEnabled,
  parsePatientHomeDailyWarmupRotationTimes,
} from "@/modules/patient-home/patientHomeDailyWarmupRotationSettings";
import { buildPatientHomeRefDisplayTitles } from "@/modules/patient-home/patientHomeBlockItemDisplayTitle";
import {
  buildPatientHomeResolverSyncContext,
  computePatientHomeBlockRuntimeStatus,
  type PatientHomeBlockRuntimeStatus,
} from "@/modules/patient-home/patientHomeRuntimeStatus";

export default async function DoctorPatientHomeSettingsPage() {
  const session = await requireDoctorAccess();
  /** Панель глобальной рассылки (system_settings) — только admin: управляет исходящими сообщениями пациентам в мессенджере, а не получателями «только админ». */
  const isAdmin = session.user.role === "admin";

  const deps = buildAppDeps();
  const [
    blocks,
    pages,
    sections,
    courses,
    practiceSetting,
    moodSetting,
    morningPingEn,
    morningPingT,
    warmupRotationEn,
    warmupRotationTimes,
    warmupCd,
    planCd,
  ] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    deps.contentPages.listAll(),
    deps.contentSections.listAll(),
    deps.courses.listCoursesForDoctor({ includeArchived: true }),
    deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin"),
    deps.systemSettings.getSetting("patient_home_mood_icons", "admin"),
    isAdmin ? deps.systemSettings.getSetting("patient_home_morning_ping_enabled", "admin") : Promise.resolve(null),
    isAdmin ? deps.systemSettings.getSetting("patient_home_morning_ping_local_time", "admin") : Promise.resolve(null),
    isAdmin ? deps.systemSettings.getSetting("patient_home_daily_warmup_rotation_enabled", "admin") : Promise.resolve(null),
    isAdmin ? deps.systemSettings.getSetting("patient_home_daily_warmup_rotation_times", "admin") : Promise.resolve(null),
    isAdmin ? deps.systemSettings.getSetting("patient_home_daily_warmup_repeat_cooldown_minutes", "admin") : Promise.resolve(null),
    isAdmin ? deps.systemSettings.getSetting("patient_treatment_plan_item_done_repeat_cooldown_minutes", "admin") : Promise.resolve(null),
  ]);
  const initialPracticeTarget = parsePatientHomeDailyPracticeTarget(practiceSetting?.valueJson ?? null);
  const moodOptions = parsePatientHomeMoodIcons(moodSetting?.valueJson ?? null);
  const initialMorningPingEnabled = parsePatientHomeMorningPingEnabled(morningPingEn?.valueJson ?? null);
  const initialMorningPingTime = parsePatientHomeMorningPingLocalTime(morningPingT?.valueJson ?? null);
  const initialWarmupRotationEnabled = parsePatientHomeDailyWarmupRotationEnabled(
    warmupRotationEn?.valueJson ?? null,
  );
  const initialWarmupRotationTimes = parsePatientHomeDailyWarmupRotationTimes(
    warmupRotationTimes?.valueJson ?? null,
  );
  const initialWarmupRepeatMinutes = parsePatientHomeDailyWarmupRepeatCooldownMinutes(warmupCd?.valueJson ?? null);
  const initialPlanItemRepeatMinutes = parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes(planCd?.valueJson ?? null);

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
    blockRuntimeStatuses[b.code] = computePatientHomeBlockRuntimeStatus(b, { knownRefs, resolverSync });
  }

  return (
    <DoctorAppShell title="Главная пациента">
      <DoctorPageHeader title="Главная пациента" />
      <PatientHomePracticeTargetPanel initialTarget={initialPracticeTarget} />
      <PatientHomeMoodIconsPanel initialOptions={moodOptions} />
      {isAdmin ? (
        <PatientHomeRepeatCooldownPanel
          initialWarmupMinutes={initialWarmupRepeatMinutes}
          initialPlanItemMinutes={initialPlanItemRepeatMinutes}
        />
      ) : null}
      {isAdmin ? (
        <div className="flex flex-col gap-3">
          <PatientHomeDailyWarmupRotationPanel
            initialEnabled={initialWarmupRotationEnabled}
            initialTimes={initialWarmupRotationTimes}
          />
          <PatientHomeMorningPingPanel
            initialEnabled={initialMorningPingEnabled}
            initialLocalTime={initialMorningPingTime}
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
