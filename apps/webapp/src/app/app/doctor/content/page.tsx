import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/common/layout/PageSection";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { ContentPagesSectionList, type ContentPageListRow } from "./ContentPagesSectionList";
import { ContentPagesSidebar } from "./ContentPagesSidebar";

function groupBySection<T extends { section: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.section) ?? [];
    list.push(r);
    m.set(r.section, list);
  }
  return m;
}

function normalizeSectionQuery(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

type Props = {
  searchParams: Promise<{ section?: string | string[] }>;
};

export default async function DoctorContentPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const sectionParam = normalizeSectionQuery(params.section);

  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;

  try {
    pages = await deps.contentPages.listAll();
    sections = await deps.contentSections.listAll();
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content", err);
  }

  const sectionTitleBySlug = new Map(sections.map((s) => [s.slug, s.title]));
  const knownSlugs = new Set(sections.map((s) => s.slug));
  const grouped = groupBySection(pages);

  const activeSectionSlug =
    sectionParam !== undefined && knownSlugs.has(sectionParam) ? sectionParam : null;

  const orderedSectionSlugs: string[] = [];
  for (const s of sections) {
    if (grouped.has(s.slug)) {
      orderedSectionSlugs.push(s.slug);
    }
  }
  const orphanSlugs = [...grouped.keys()]
    .filter((k) => !knownSlugs.has(k))
    .sort();
  orderedSectionSlugs.push(...orphanSlugs);

  const toListRow = (p: (typeof pages)[0]): ContentPageListRow => ({
    id: p.id,
    section: p.section,
    slug: p.slug,
    title: p.title,
    sortOrder: p.sortOrder,
    isPublished: p.isPublished,
    requiresAuth: p.requiresAuth,
    archivedAt: p.archivedAt,
    deletedAt: p.deletedAt,
  });

  const sidebarSections = sections.map((s) => ({ slug: s.slug, title: s.title }));

  const createPageBtnClass = buttonVariants({ size: "default" });

  const mainHeading =
    activeSectionSlug !== null
      ? (sectionTitleBySlug.get(activeSectionSlug) ?? activeSectionSlug)
      : "Страницы контента";

  const isDev = process.env.NODE_ENV === "development";

  if (loadError) {
    return (
      <AppShell title="Контент" user={session.user} variant="doctor">
        <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <ContentPagesSidebar sections={[]} activeSectionSlug={null} />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <DataLoadFailureNotice
                digest={loadError.digest}
                devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
              />
            </div>
          </div>
        </PageSection>
      </AppShell>
    );
  }

  return (
    <AppShell title="Контент" user={session.user} variant="doctor">
      <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          <ContentPagesSidebar sections={sidebarSections} activeSectionSlug={activeSectionSlug} />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="m-0 text-lg font-semibold">{mainHeading}</h2>
              <Link
                href={
                  activeSectionSlug !== null
                    ? `/app/doctor/content/new?section=${encodeURIComponent(activeSectionSlug)}`
                    : "/app/doctor/content/new"
                }
                className={createPageBtnClass}
              >
                Создать страницу
              </Link>
            </div>

            {activeSectionSlug !== null ? (
              <ContentPagesSectionList
                sectionSlug={activeSectionSlug}
                sectionTitle={sectionTitleBySlug.get(activeSectionSlug) ?? activeSectionSlug}
                initialPages={(grouped.get(activeSectionSlug) ?? []).map(toListRow)}
                showSectionHeading={false}
              />
            ) : pages.length === 0 ? (
              <p className="text-muted-foreground">Нет страниц контента.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {orderedSectionSlugs.map((sectionSlug) => {
                  const rows = grouped.get(sectionSlug);
                  if (!rows?.length) return null;
                  return (
                    <ContentPagesSectionList
                      key={sectionSlug}
                      sectionSlug={sectionSlug}
                      sectionTitle={sectionTitleBySlug.get(sectionSlug) ?? sectionSlug}
                      initialPages={rows.map(toListRow)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PageSection>
    </AppShell>
  );
}
