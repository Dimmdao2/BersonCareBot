import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parsePatientHomeDailyPracticeTarget } from "@/modules/patient-home/todayConfig";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { PatientHomeBlocksSettingsPageClient } from "./PatientHomeBlocksSettingsPageClient";
import { PatientHomePracticeTargetPanel } from "./PatientHomePracticeTargetPanel";

export default async function PatientHomeSettingsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role !== "admin") redirect("/app/settings");

  const deps = buildAppDeps();
  const [blocks, pages, sections, courses, practiceSetting] = await Promise.all([
    deps.patientHomeBlocks.listBlocksWithItems(),
    deps.contentPages.listAll(),
    deps.contentSections.listAll(),
    deps.courses.listCoursesForDoctor({ includeArchived: true }),
    deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin"),
  ]);
  const initialPracticeTarget = parsePatientHomeDailyPracticeTarget(practiceSetting?.valueJson ?? null);

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
      <PatientHomeBlocksSettingsPageClient initialBlocks={blocks} knownRefs={knownRefs} />
    </div>
  );
}
