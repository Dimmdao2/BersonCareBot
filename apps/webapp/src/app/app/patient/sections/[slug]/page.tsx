/**
 * Список материалов раздела: «/app/patient/sections/[slug]».
 * Раздел и карточки загружаются из БД (content_sections + content_pages).
 */

import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { FeatureCard } from "@/shared/ui/FeatureCard";

type Props = { params: Promise<{ slug: string }> };

export default async function PatientSectionPage({ params }: Props) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const session = await getOptionalPatientSession();
  const deps = buildAppDeps();

  const section = await deps.contentSections.getBySlug(slug);
  if (!section || !section.isVisible) notFound();

  const pages = await deps.contentPages.listBySection(slug);

  return (
    <AppShell title={section.title} user={session?.user ?? null} backHref="/app/patient" backLabel="Меню" variant="patient">
      <section id={`patient-section-${slug}-grid`} className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <FeatureCard
            key={p.id}
            containerId={`patient-section-${slug}-card-${p.slug}`}
            title={p.title}
            href={`/app/patient/content/${p.slug}`}
            compact
          />
        ))}
      </section>
      {pages.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">В этом разделе пока нет материалов.</p>
      ) : null}
    </AppShell>
  );
}
