import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/common/layout/PageSection";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import type { ContentSectionRow } from "@/modules/content-sections/ports";
import { CMS_UNASSIGNED_SECTION_SLUG, isSectionSlugProtectedFromDelete, isSystemParentCode, SYSTEM_PARENT_CODES } from "@/modules/content-sections/types";
import { AttachExistingSectionsModal } from "./AttachExistingSectionsModal";
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

function normalizeQueryParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

const SYSTEM_FOLDER_HEADING: Record<(typeof SYSTEM_PARENT_CODES)[number], string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
  lessons: "Уроки",
};

function isArticlePage(p: { section: string }, sections: ContentSectionRow[]): boolean {
  const sec = sections.find((s) => s.slug === p.section);
  return !sec || sec.kind === "article";
}

type Props = {
  searchParams: Promise<{ section?: string | string[]; systemParentCode?: string | string[] }>;
};

export default async function DoctorContentPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const params = await searchParams;
  const sectionParam = normalizeQueryParam(params.section);
  const systemParentParam = normalizeQueryParam(params.systemParentCode);
  const validSystemParent = isSystemParentCode(systemParentParam) ? systemParentParam : undefined;

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

  const sectionRowForActive = activeSectionSlug ? sections.find((s) => s.slug === activeSectionSlug) : undefined;
  const highlightArticleSlug =
    activeSectionSlug !== null && sectionRowForActive?.kind === "article" ? activeSectionSlug : null;
  const highlightSystemFolderCode: (typeof SYSTEM_PARENT_CODES)[number] | null =
    validSystemParent ??
    (sectionRowForActive?.kind === "system" && sectionRowForActive.systemParentCode
      ? sectionRowForActive.systemParentCode
      : null);

  const articleSections = sections.filter((s) => s.kind === "article").map((s) => ({ slug: s.slug, title: s.title }));
  const articleSectionsForSidebar = articleSections.filter((s) => s.slug !== CMS_UNASSIGNED_SECTION_SLUG);
  const unassignedRow = sections.find((s) => s.slug === CMS_UNASSIGNED_SECTION_SLUG);
  const freeSectionsSortedForAttach = [...articleSectionsForSidebar].sort((a, b) =>
    a.title.localeCompare(b.title, "ru"),
  );

  const articlePages = pages.filter((p) => isArticlePage(p, sections));
  const groupedArticle = groupBySection(articlePages);
  const unassignedPages = groupedArticle.get(CMS_UNASSIGNED_SECTION_SLUG);
  const unassignedSectionNav =
    unassignedRow && unassignedPages && unassignedPages.length > 0 ?
      { slug: unassignedRow.slug, title: unassignedRow.title, pageCount: unassignedPages.length }
    : null;
  const articleSectionSlugsOrdered = sections.filter((s) => s.kind === "article").map((s) => s.slug);

  const orderedArticleSectionSlugs: string[] = [];
  for (const slug of articleSectionSlugsOrdered) {
    if (groupedArticle.has(slug)) orderedArticleSectionSlugs.push(slug);
  }
  const orphanArticleSlugs = [...groupedArticle.keys()]
    .filter((k) => !articleSectionSlugsOrdered.includes(k))
    .sort();
  orderedArticleSectionSlugs.push(...orphanArticleSlugs);

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

  const createPageBtnClass = buttonVariants({ size: "default" });

  const folderChildSections =
    validSystemParent !== undefined && activeSectionSlug === null
      ? sections
          .filter((s) => s.kind === "system" && s.systemParentCode === validSystemParent)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"))
      : [];

  let mainHeading = "Страницы контента";
  if (validSystemParent !== undefined && activeSectionSlug === null) {
    mainHeading = SYSTEM_FOLDER_HEADING[validSystemParent];
  } else if (activeSectionSlug !== null) {
    mainHeading = sectionTitleBySlug.get(activeSectionSlug) ?? activeSectionSlug;
  }

  /** На корне системной папки (?systemParentCode без ?section) страницу не создаём — только дочерние CMS-разделы (страница всегда привязана к slug раздела). */
  const isSystemFolderRoot = validSystemParent !== undefined && activeSectionSlug === null;
  const isUnassignedBucket = activeSectionSlug === CMS_UNASSIGNED_SECTION_SLUG;
  const showCreatePageButton = !isSystemFolderRoot && !isUnassignedBucket;

  let createPageHref = "/app/doctor/content/new";
  if (activeSectionSlug !== null) {
    const q = new URLSearchParams();
    q.set("section", activeSectionSlug);
    if (sectionRowForActive?.kind === "system" && sectionRowForActive.systemParentCode) {
      q.set("systemParentCode", sectionRowForActive.systemParentCode);
    }
    createPageHref = `/app/doctor/content/new?${q.toString()}`;
  }

  const isDev = process.env.NODE_ENV === "development";

  if (loadError) {
    return (
      <AppShell title="Контент" user={session.user} variant="doctor">
        <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-4">
            <ContentPagesSidebar
              articleSections={[]}
              unassignedSectionNav={null}
              highlightArticleSlug={null}
              highlightSystemFolderCode={null}
            />
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
      <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-4">
          <ContentPagesSidebar
            articleSections={articleSectionsForSidebar}
            unassignedSectionNav={unassignedSectionNav}
            highlightArticleSlug={highlightArticleSlug}
            highlightSystemFolderCode={highlightSystemFolderCode}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="m-0 text-lg font-semibold">{mainHeading}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {validSystemParent !== undefined && activeSectionSlug === null ? (
                  <>
                    <Link
                      href={`/app/doctor/content/sections/new?systemParentCode=${encodeURIComponent(validSystemParent)}`}
                      className={buttonVariants({ variant: "outline", size: "default" })}
                    >
                      Создать подраздел
                    </Link>
                    <AttachExistingSectionsModal
                      folderCode={validSystemParent}
                      freeSections={freeSectionsSortedForAttach}
                    />
                  </>
                ) : null}
                {showCreatePageButton ? (
                  <Link href={createPageHref} className={createPageBtnClass}>
                    Создать страницу
                  </Link>
                ) : null}
              </div>
            </div>

            {validSystemParent !== undefined && activeSectionSlug === null ? (
              folderChildSections.length === 0 ? (
                <p className="text-muted-foreground">
                  Страницу нельзя повесить прямо на корень этой папки: в CMS у страницы всегда есть раздел. Создайте
                  подраздел (достаточно одного, например «Каталог») — внутри него будут страницы и кнопка «Создать
                  страницу».
                </p>
              ) : (
                <div className="flex flex-col gap-8">
                  {folderChildSections.map((sec) => {
                    const rows = grouped.get(sec.slug) ?? [];
                    return (
                      <ContentPagesSectionList
                        key={sec.slug}
                        sectionSlug={sec.slug}
                        sectionTitle={sec.title}
                        initialPages={rows.map(toListRow)}
                        newPageSystemParentCode={validSystemParent}
                        sectionSettingsHref={`/app/doctor/content/sections/edit/${encodeURIComponent(sec.slug)}`}
                        allowDeleteSection={!isSectionSlugProtectedFromDelete(sec.slug)}
                        pagesInSectionCount={rows.length}
                      />
                    );
                  })}
                </div>
              )
            ) : activeSectionSlug !== null ? (
              <ContentPagesSectionList
                sectionSlug={activeSectionSlug}
                sectionTitle={sectionTitleBySlug.get(activeSectionSlug) ?? activeSectionSlug}
                initialPages={(grouped.get(activeSectionSlug) ?? []).map(toListRow)}
                showSectionHeading={false}
                newPageSystemParentCode={
                  sectionRowForActive?.kind === "system" && sectionRowForActive.systemParentCode ?
                    sectionRowForActive.systemParentCode
                  : undefined
                }
                sectionSettingsHref={`/app/doctor/content/sections/edit/${encodeURIComponent(activeSectionSlug)}`}
                allowDeleteSection={!isSectionSlugProtectedFromDelete(activeSectionSlug)}
                pagesInSectionCount={(grouped.get(activeSectionSlug) ?? []).length}
              />
            ) : articlePages.length === 0 ? (
              <p className="text-muted-foreground">Нет страниц контента.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {orderedArticleSectionSlugs.map((sectionSlug) => {
                  const rows = groupedArticle.get(sectionSlug);
                  if (!rows?.length) return null;
                  return (
                    <ContentPagesSectionList
                      key={sectionSlug}
                      sectionSlug={sectionSlug}
                      sectionTitle={sectionTitleBySlug.get(sectionSlug) ?? sectionSlug}
                      initialPages={rows.map(toListRow)}
                      sectionSettingsHref={`/app/doctor/content/sections/edit/${encodeURIComponent(sectionSlug)}`}
                      allowDeleteSection={!isSectionSlugProtectedFromDelete(sectionSlug)}
                      pagesInSectionCount={rows.length}
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
