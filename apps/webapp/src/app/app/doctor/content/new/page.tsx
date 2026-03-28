import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ContentForm } from "../ContentForm";

export default async function DoctorContentNewPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  try {
    sections = await deps.contentSections.listAll();
  } catch {
    /* port unavailable */
  }

  return (
    <AppShell title="Новая страница" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <ContentForm sections={sections} />
      </section>
    </AppShell>
  );
}
