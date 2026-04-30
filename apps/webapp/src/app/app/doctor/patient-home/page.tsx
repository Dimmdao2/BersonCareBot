import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { PatientHomeBlocksSettingsPageClient } from "@/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient";
import { PatientHomePracticeTargetPanel } from "@/app/app/settings/patient-home/PatientHomePracticeTargetPanel";
import { PatientHomeMorningPingPanel } from "@/app/app/settings/patient-home/PatientHomeMorningPingPanel";
import { PatientHomeMoodIconsPanel } from "./PatientHomeMoodIconsPanel";
import { parsePatientHomeMoodIcons } from "@/modules/patient-home/patientHomeMoodIcons";
import {
  parsePatientHomeMorningPingEnabled,
  parsePatientHomeMorningPingLocalTime,
} from "@/modules/patient-home/patientHomeMorningPingSettings";
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
  const [blocks, pages, sections, courses, practiceSetting, moodSetting, morningPingEn, morningPingT] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    deps.contentPages.listAll(),
    deps.contentSections.listAll(),
    deps.courses.listCoursesForDoctor({ includeArchived: true }),
    deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin"),
    deps.systemSettings.getSetting("patient_home_mood_icons", "admin"),
    isAdmin ? deps.systemSettings.getSetting("patient_home_morning_ping_enabled", "admin") : Promise.resolve(null),
    isAdmin ? deps.systemSettings.getSetting("patient_home_morning_ping_local_time", "admin") : Promise.resolve(null),
  ]);
  const initialPracticeTarget = parsePatientHomeDailyPracticeTarget(practiceSetting?.valueJson ?? null);
  const moodOptions = parsePatientHomeMoodIcons(moodSetting?.valueJson ?? null);
  const initialMorningPingEnabled = parsePatientHomeMorningPingEnabled(morningPingEn?.valueJson ?? null);
  const initialMorningPingTime = parsePatientHomeMorningPingLocalTime(morningPingT?.valueJson ?? null);

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
    })),
    pages: pages.map((p) => ({
      slug: p.slug,
      requiresAuth: p.requiresAuth,
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
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Главная пациента</h1>
      </div>
      <div className="mb-6">
        <PatientHomePracticeTargetPanel initialTarget={initialPracticeTarget} />
      </div>
      <div className="mb-6">
        <PatientHomeMoodIconsPanel initialOptions={moodOptions} />
      </div>
      {isAdmin ? (
        <div className="mb-6">
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
    </div>
  );
}
