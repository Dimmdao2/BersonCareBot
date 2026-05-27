import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { parseHealthArchiveProbeParam } from "@/app/app/settings/adminSettingsData";
import { HealthFailureArchiveSection } from "@/app/app/settings/HealthFailureArchiveSection";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default async function DoctorHealthArchivePage({
  searchParams,
}: {
  searchParams?: Promise<{ probe?: string | string[] }>;
}) {
  await requireAdminDoctorPage();
  const sp = searchParams != null ? await searchParams : {};
  const healthArchiveProbe = parseHealthArchiveProbeParam(sp.probe);

  return (
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-6 text-xl font-semibold">Архив сбоев</h1>
      <HealthFailureArchiveSection initialProbe={healthArchiveProbe ?? "all"} />
    </div>
  );
}
