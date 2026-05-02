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

  const [row, pagesInSection] = await Promise.all([
    deps.contentSections.getBySlug(slug),
    deps.contentPages.countPagesWithSectionSlug(slug),
  ]);
  if (!row) notFound();

  return (
    <AppShell title="Редактировать раздел" user={session.user} variant="doctor" backHref="/app/doctor/content/sections">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <SectionForm
          section={{
            slug: row.slug,
            title: row.title,
            description: row.description,
            sortOrder: row.sortOrder,
            isVisible: row.isVisible,
            requiresAuth: row.requiresAuth,
            coverImageUrl: row.coverImageUrl,
            iconImageUrl: row.iconImageUrl,
            kind: row.kind,
            systemParentCode: row.systemParentCode,
          }}
          pagesInSection={pagesInSection}
        />
      </section>
    </AppShell>
  );
}
