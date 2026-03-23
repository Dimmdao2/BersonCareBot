import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PlaceholderPage } from "@/shared/ui/PlaceholderPage";

export default async function DoctorReferencesPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Справочники" user={session.user} variant="doctor">
      <PlaceholderPage title="Справочники" />
    </AppShell>
  );
}
