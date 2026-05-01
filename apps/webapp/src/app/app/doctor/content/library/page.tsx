import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PageSection } from "@/components/common/layout/PageSection";
import { MediaLibraryClient } from "./MediaLibraryClient";

export default async function DoctorContentLibraryPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Библиотека файлов" user={session.user} variant="doctor">
      <PageSection id="doctor-content-library-section" as="section" className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Библиотека файлов</h2>
        <MediaLibraryClient
          canSeeDeleteErrorsLink={session.user.role === "admin" && Boolean(session.adminMode)}
        />
      </PageSection>
    </AppShell>
  );
}
