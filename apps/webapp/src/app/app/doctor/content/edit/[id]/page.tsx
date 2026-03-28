import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ContentForm } from "../../ContentForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DoctorContentEditPage({ params }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const { id } = await params;

  const page = await deps.contentPages.getById(id);
  if (!page) notFound();

  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  try {
    sections = await deps.contentSections.listAll();
  } catch {
    /* port unavailable */
  }

  return (
    <AppShell title="Редактировать страницу" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <ContentForm page={page} sections={sections} />
      </section>
    </AppShell>
  );
}
