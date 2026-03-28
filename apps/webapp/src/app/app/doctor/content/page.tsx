import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/common/layout/PageSection";
import { cn } from "@/lib/utils";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ContentPagesSectionList, type ContentPageListRow } from "./ContentPagesSectionList";

function groupBySection<T extends { section: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.section) ?? [];
    list.push(r);
    m.set(r.section, list);
  }
  return m;
}

const hubBtnClass = cn(
  buttonVariants({ variant: "outline", size: "default" }),
  "h-11 min-h-11 flex-1 basis-0 justify-center px-3 text-sm font-medium sm:text-base",
);

const hubPrimaryBtnClass = cn(
  buttonVariants({ size: "default" }),
  "h-11 min-h-11 flex-1 basis-0 justify-center px-3 text-sm font-medium sm:text-base",
);

export default async function DoctorContentPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  try {
    pages = await deps.contentPages.listAll();
    sections = await deps.contentSections.listAll();
  } catch {
    /* port unavailable */
  }

  const sectionTitleBySlug = new Map(sections.map((s) => [s.slug, s.title]));
  const grouped = groupBySection(pages);

  const toListRow = (p: (typeof pages)[0]): ContentPageListRow => ({
    id: p.id,
    section: p.section,
    slug: p.slug,
    title: p.title,
    sortOrder: p.sortOrder,
    isPublished: p.isPublished,
    archivedAt: p.archivedAt,
    deletedAt: p.deletedAt,
  });

  return (
    <AppShell title="Контент" user={session.user} variant="doctor">
      <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-6">
        <h2 className="m-0 text-lg font-semibold">Страницы контента</h2>

        <div className="flex w-full flex-col gap-3 px-0 sm:px-1">
          <div className="flex w-full gap-2 sm:gap-3">
            <Link href="/app/doctor/content/news" className={hubBtnClass}>
              Новости
            </Link>
            <Link href="/app/doctor/content/motivation" className={hubBtnClass}>
              Мотивация
            </Link>
          </div>
          <div className="flex w-full gap-2 sm:gap-3">
            <Link href="/app/doctor/content/new" className={hubPrimaryBtnClass}>
              Создать страницу
            </Link>
            <Link href="/app/doctor/content/sections" className={hubBtnClass}>
              Разделы
            </Link>
          </div>
        </div>

        {pages.length === 0 ? (
          <p className="text-muted-foreground">Нет страниц контента.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {[...grouped.entries()].map(([sectionSlug, rows]) => (
              <ContentPagesSectionList
                key={sectionSlug}
                sectionSlug={sectionSlug}
                sectionTitle={sectionTitleBySlug.get(sectionSlug) ?? sectionSlug}
                initialPages={rows.map(toListRow)}
              />
            ))}
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}
