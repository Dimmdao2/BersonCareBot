import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { SectionForm } from "../SectionForm";

export default async function DoctorContentSectionNewPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Новый раздел" user={session.user} variant="doctor" backHref="/app/doctor/content/sections">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <SectionForm />
      </section>
    </AppShell>
  );
}
