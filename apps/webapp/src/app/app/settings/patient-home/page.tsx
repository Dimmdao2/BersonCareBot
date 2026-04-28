import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { PatientHomeBlocksSettingsPageClient } from "./PatientHomeBlocksSettingsPageClient";
import { PatientHomePracticeTargetPanel } from "./PatientHomePracticeTargetPanel";
import { PatientHomeMorningPingPanel } from "./PatientHomeMorningPingPanel";

function parseMorningPingEnabled(valueJson: unknown): boolean {
  if (valueJson !== null && typeof valueJson === "object" && "value" in valueJson) {
    const v = (valueJson as { value: unknown }).value;
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return false;
}

function parseMorningPingLocalTime(valueJson: unknown): string {
  let raw: unknown = valueJson;
  if (valueJson !== null && typeof valueJson === "object" && "value" in valueJson) {
    raw = (valueJson as { value: unknown }).value;
  }
  if (typeof raw !== "string") return "09:00";
  const t = raw.trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return "09:00";
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export default async function PatientHomeSettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role !== "admin") redirect("/app/settings");

  const deps = buildAppDeps();
  const [blocks, pages, sections, courses, practiceSetting, morningPingEn, morningPingT] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    deps.contentPages.listAll(),
    deps.contentSections.listAll(),
    deps.courses.listCoursesForDoctor({ includeArchived: true }),
    deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin"),
    deps.systemSettings.getSetting("patient_home_morning_ping_enabled", "admin"),
    deps.systemSettings.getSetting("patient_home_morning_ping_local_time", "admin"),
  ]);
  const initialPracticeTarget = parsePatientHomeDailyPracticeTarget(practiceSetting?.valueJson ?? null);
  const initialMorningPingEnabled = parseMorningPingEnabled(morningPingEn?.valueJson ?? null);
  const initialMorningPingTime = parseMorningPingLocalTime(morningPingT?.valueJson ?? null);

  const knownRefs = {
    contentPages: [...new Set(pages.map((p) => p.slug))],
    contentSections: [...new Set(sections.map((s) => s.slug))],
    courses: [...new Set(courses.map((c) => c.id))],
  };

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Главная пациента</h1>
      </div>
      <div className="mb-6">
        <PatientHomePracticeTargetPanel initialTarget={initialPracticeTarget} />
      </div>
      <div className="mb-6">
        <PatientHomeMorningPingPanel
          initialEnabled={initialMorningPingEnabled}
          initialLocalTime={initialMorningPingTime}
        />
      </div>
      <PatientHomeBlocksSettingsPageClient initialBlocks={blocks} knownRefs={knownRefs} />
    </div>
  );
}
