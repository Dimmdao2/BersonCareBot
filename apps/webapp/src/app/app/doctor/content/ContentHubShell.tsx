"use client";

import { useMemo } from "react";
import Link from "next/link";
import { isSectionSlugProtectedFromDelete, isSystemParentCode } from "@/modules/content-sections/types";
import type { ContentSectionRow } from "@/modules/content-sections/ports";
import type { SystemParentCode } from "@/modules/content-sections/types";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DataLoadFailureNotice } from "@/shared/ui/doctor/DataLoadFailureNotice";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { CatalogLeftPane } from "@/shared/ui/doctor/catalog/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/doctor/catalog/CatalogRightPane";
import {
  ContentNav,
  useContentNavState,
  type ContentNavSectionEntry,
} from "./ContentNav";
import {
  ContentPagesSectionList,
  type ContentPageListRow,
} from "./ContentPagesSectionList";
import type { ContentRatingSummary } from "./ContentRatingChip";
import type { PublishedCourseOption } from "./ContentForm";
import { AttachExistingSectionsModal } from "./AttachExistingSectionsModal";
import {
  useInlineContentEditor,
  ContentEditorRightPane,
} from "./ContentEditorRightPane";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentHubSection = {
  slug: string;
  title: string;
  isVisible: boolean;
  kind: ContentSectionRow["kind"];
  systemParentCode: ContentSectionRow["systemParentCode"];
  sortOrder: number;
};

export type ContentHubShellProps = {
  sections: ContentHubSection[];
  /** Full ContentSectionRow[] needed by ContentForm's section select. */
  fullSections: ContentSectionRow[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  /** Per-page ★ rating aggregates, keyed by page id (#2 Контент Шаг 3). */
  ratingsById?: Record<string, ContentRatingSummary>;
  /** Published courses for ContentForm's "Связан с курсом" select. */
  publishedCourses: PublishedCourseOption[];
  loadError?: { digest: string; name: string; message: string } | null;
  isDev?: boolean;
};

// ---------------------------------------------------------------------------
// System folder pane (with inline master-detail)
// ---------------------------------------------------------------------------

const SYSTEM_FOLDER_LABELS: Record<string, string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
  lessons: "Уроки · Новости · Мотивации",
};

function SystemFolderPane({
  folderCode,
  sections,
  pagesBySectionSlug,
  ratingsById,
  fullSections,
  publishedCourses,
}: {
  folderCode: SystemParentCode;
  sections: ContentHubSection[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  ratingsById?: Record<string, ContentRatingSummary>;
  fullSections: ContentSectionRow[];
  publishedCourses: PublishedCourseOption[];
}) {
  const label = SYSTEM_FOLDER_LABELS[folderCode] ?? folderCode;
  const childSections = useMemo(
    () =>
      sections
        .filter((s) => s.kind === "system" && s.systemParentCode === folderCode)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru")),
    [sections, folderCode],
  );

  const freeSections = useMemo(
    () =>
      sections
        .filter((s) => s.kind === "article")
        .map((s) => ({ slug: s.slug, title: s.title }))
        .sort((a, b) => a.title.localeCompare(b.title, "ru")),
    [sections],
  );

  // One shared selection state for all subsections in this system folder
  const editor = useInlineContentEditor();

  const folderHeader = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="m-0 text-xl font-semibold">{label}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/doctor/content/sections/new?systemParentCode=${encodeURIComponent(folderCode)}`}
          className={buttonVariants({ variant: "outline", size: "default" })}
        >
          Создать подраздел
        </Link>
        <AttachExistingSectionsModal
          folderCode={folderCode}
          freeSections={freeSections}
        />
      </div>
    </div>
  );

  if (childSections.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {folderHeader}
        <p className="text-muted-foreground">
          Страницу нельзя повесить прямо на корень этой папки: в CMS у страницы всегда есть раздел.
          Создайте подраздел (достаточно одного, например «Каталог») — внутри него будут страницы и
          кнопка «Создать страницу».
        </p>
      </div>
    );
  }

  const leftContent = (
    <CatalogLeftPane stickySplit={false} className="min-h-[300px]">
      <div className="flex flex-col gap-8 overflow-y-auto p-2">
        {childSections.map((sec) => {
          const rows = pagesBySectionSlug[sec.slug] ?? [];
          return (
            <ContentPagesSectionList
              key={sec.slug}
              sectionSlug={sec.slug}
              sectionTitle={sec.title}
              initialPages={rows}
              ratingsById={ratingsById}
              newPageSystemParentCode={folderCode}
              sectionSettingsHref={`/app/doctor/content/sections/edit/${encodeURIComponent(sec.slug)}`}
              allowDeleteSection={!isSectionSlugProtectedFromDelete(sec.slug)}
              pagesInSectionCount={rows.length}
              selectedPageId={editor.selectedPageId}
              onSelectPage={editor.select}
            />
          );
        })}
      </div>
    </CatalogLeftPane>
  );

  const rightContent = (
    <CatalogRightPane className="min-h-[300px]" contentClassName="px-4 py-4">
      <ContentEditorRightPane
        selectedPageId={editor.selectedPageId}
        loadedPage={editor.loadedPage}
        loading={editor.loading}
        clear={editor.clear}
        sections={fullSections}
        publishedCourses={publishedCourses}
      />
    </CatalogRightPane>
  );

  return (
    <div className="flex flex-col gap-4">
      {folderHeader}
      <CatalogSplitLayout
        left={leftContent}
        right={rightContent}
        mobileView={editor.selectedPageId != null ? "detail" : "list"}
        mobileBackSlot={
          editor.selectedPageId != null ? (
            <Button
              variant="ghost"
              type="button"
              className="mb-2 h-9 px-2"
              onClick={editor.clear}
            >
              ← к списку
            </Button>
          ) : null
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article section pane (with inline master-detail)
// ---------------------------------------------------------------------------

function ArticleSectionPane({
  sectionSlug,
  sectionTitle,
  sections,
  pagesBySectionSlug,
  ratingsById,
  fullSections,
  publishedCourses,
}: {
  sectionSlug: string;
  sectionTitle: string;
  sections: ContentHubSection[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  ratingsById?: Record<string, ContentRatingSummary>;
  fullSections: ContentSectionRow[];
  publishedCourses: PublishedCourseOption[];
}) {
  const sec = sections.find((s) => s.slug === sectionSlug);
  const pages = pagesBySectionSlug[sectionSlug] ?? [];
  const newPageSystemParentCode =
    sec?.kind === "system" && sec.systemParentCode ? sec.systemParentCode : undefined;

  const editor = useInlineContentEditor();

  const leftContent = (
    <CatalogLeftPane stickySplit={false} className="min-h-[300px]">
      <div className="overflow-y-auto p-2">
        <ContentPagesSectionList
          sectionSlug={sectionSlug}
          sectionTitle={sectionTitle}
          initialPages={pages}
          ratingsById={ratingsById}
          showSectionHeading={false}
          newPageSystemParentCode={newPageSystemParentCode}
          sectionSettingsHref={`/app/doctor/content/sections/edit/${encodeURIComponent(sectionSlug)}`}
          allowDeleteSection={!isSectionSlugProtectedFromDelete(sectionSlug)}
          pagesInSectionCount={pages.length}
          selectedPageId={editor.selectedPageId}
          onSelectPage={editor.select}
        />
      </div>
    </CatalogLeftPane>
  );

  const rightContent = (
    <CatalogRightPane className="min-h-[300px]" contentClassName="px-4 py-4">
      <ContentEditorRightPane
        selectedPageId={editor.selectedPageId}
        loadedPage={editor.loadedPage}
        loading={editor.loading}
        clear={editor.clear}
        sections={fullSections}
        publishedCourses={publishedCourses}
      />
    </CatalogRightPane>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="m-0 text-xl font-semibold">{sectionTitle}</h2>
        <Link
          href={`/app/doctor/content/new?section=${encodeURIComponent(sectionSlug)}${newPageSystemParentCode ? `&systemParentCode=${encodeURIComponent(newPageSystemParentCode)}` : ""}`}
          className={buttonVariants({ size: "default" })}
        >
          Создать страницу
        </Link>
      </div>
      <CatalogSplitLayout
        left={leftContent}
        right={rightContent}
        mobileView={editor.selectedPageId != null ? "detail" : "list"}
        mobileBackSlot={
          editor.selectedPageId != null ? (
            <Button
              variant="ghost"
              type="button"
              className="mb-2 h-9 px-2"
              onClick={editor.clear}
            >
              ← к списку
            </Button>
          ) : null
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentHubShell
// ---------------------------------------------------------------------------

/**
 * Client shell for the Контент hub.
 * Owns the active-pane state (with URL sync via ?section=).
 * Receives all data from the server page component.
 */
export function ContentHubShell({
  sections,
  fullSections,
  pagesBySectionSlug,
  ratingsById,
  publishedCourses,
  loadError,
  isDev,
}: ContentHubShellProps) {
  const articleSectionEntries: ContentNavSectionEntry[] = useMemo(
    () =>
      sections
        .filter((s) => s.kind === "article")
        .map((s) => ({ slug: s.slug, title: s.title, isVisible: s.isVisible })),
    [sections],
  );

  const { activePaneKey, setActivePaneKey } = useContentNavState(articleSectionEntries);

  const renderRightPanel = () => {
    if (loadError) {
      return (
        <DataLoadFailureNotice
          digest={loadError.digest}
          devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
        />
      );
    }

    if (activePaneKey === "patient-home" || activePaneKey === "media") {
      // These are handled as Link navigations in ContentNav; won't reach here
      return null;
    }

    if (isSystemParentCode(activePaneKey)) {
      return (
        <SystemFolderPane
          folderCode={activePaneKey}
          sections={sections}
          pagesBySectionSlug={pagesBySectionSlug}
          ratingsById={ratingsById}
          fullSections={fullSections}
          publishedCourses={publishedCourses}
        />
      );
    }

    if (activePaneKey.startsWith("section:")) {
      const slug = activePaneKey.slice("section:".length);
      const sec = sections.find((s) => s.slug === slug);
      if (!sec) {
        return <p className="text-muted-foreground">Раздел не найден.</p>;
      }
      return (
        <ArticleSectionPane
          sectionSlug={slug}
          sectionTitle={sec.title}
          sections={sections}
          pagesBySectionSlug={pagesBySectionSlug}
          ratingsById={ratingsById}
          fullSections={fullSections}
          publishedCourses={publishedCourses}
        />
      );
    }

    return <p className="text-muted-foreground">Выберите раздел.</p>;
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-4">
      <ContentNav
        articleSections={articleSectionEntries}
        activePaneKey={activePaneKey}
        onPaneChange={setActivePaneKey}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4">{renderRightPanel()}</div>
    </div>
  );
}
