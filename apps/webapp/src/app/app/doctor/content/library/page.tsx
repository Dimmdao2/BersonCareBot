import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { PageSection } from "@/components/common/layout/PageSection";
import { MediaLibraryClient } from "./MediaLibraryClient";

export default async function DoctorContentLibraryPage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell title="Библиотека файлов" backHref="/app/doctor/content" user={session.user}>
      <DoctorPageHeader title="Библиотека файлов" />
      <PageSection id="doctor-content-library-section" as="section" className="flex flex-col gap-4">
        <MediaLibraryClient
          canSeeDeleteErrorsLink={session.user.role === "admin" && Boolean(session.adminMode)}
        />
      </PageSection>
    </DoctorAppShell>
  );
}
