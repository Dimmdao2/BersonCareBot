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

  return (
    <AppShell title="Редактировать страницу" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <section className="panel stack">
        <ContentForm page={page} />
      </section>
    </AppShell>
  );
}
