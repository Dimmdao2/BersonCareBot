import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { parseHealthArchiveProbeParam } from "@/app/app/settings/adminSettingsData";
import { HealthFailureArchiveSection } from "@/app/app/settings/HealthFailureArchiveSection";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";

export default async function DoctorHealthArchivePage({
  searchParams,
}: {
  searchParams?: Promise<{ probe?: string | string[] }>;
}) {
  await requireAdminDoctorPage();
  const sp = searchParams != null ? await searchParams : {};
  const healthArchiveProbe = parseHealthArchiveProbeParam(sp.probe);

  return (
    <DoctorAppShell title="Архив сбоев">
      <DoctorPageHeader title="Архив сбоев" />
      <HealthFailureArchiveSection initialProbe={healthArchiveProbe ?? "all"} />
    </DoctorAppShell>
  );
}
