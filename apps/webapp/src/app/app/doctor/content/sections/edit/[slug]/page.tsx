import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { SectionForm } from "../../SectionForm";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function DoctorContentSectionEditPage({ params }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);

  const row = await deps.contentSections.getBySlug(slug);
  if (!row) notFound();

  return (
    <AppShell title="Редактировать раздел" user={session.user} variant="doctor" backHref="/app/doctor/content/sections">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <SectionForm
          section={{
            slug: row.slug,
            title: row.title,
            description: row.description,
            sortOrder: row.sortOrder,
            isVisible: row.isVisible,
          }}
        />
      </section>
    </AppShell>
  );
}
