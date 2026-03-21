import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ContentForm } from "../ContentForm";

export default async function DoctorContentNewPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Новая страница" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <section className="panel stack">
        <ContentForm />
      </section>
    </AppShell>
  );
}
