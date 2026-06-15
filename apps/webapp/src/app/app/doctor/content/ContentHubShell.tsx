"use client";

import { useMemo } from "react";
import Link from "next/link";
import { isSectionSlugProtectedFromDelete, isSystemParentCode } from "@/modules/content-sections/types";
import type { ContentSectionRow } from "@/modules/content-sections/ports";
import type { SystemParentCode } from "@/modules/content-sections/types";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { DataLoadFailureNotice } from "@/shared/ui/doctor/DataLoadFailureNotice";
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
import { AttachExistingSectionsModal } from "./AttachExistingSectionsModal";

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
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  /** Per-page ★ rating aggregates, keyed by page id (#2 Контент Шаг 3). */
  ratingsById?: Record<string, ContentRatingSummary>;
  loadError?: { digest: string; name: string; message: string } | null;
  isDev?: boolean;
};

// ---------------------------------------------------------------------------
// System folder pane
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
}: {
  folderCode: SystemParentCode;
  sections: ContentHubSection[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  ratingsById?: Record<string, ContentRatingSummary>;
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

  return (
    <div className="flex flex-col gap-4">
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

      {childSections.length === 0 ? (
        <p className="text-muted-foreground">
          Страницу нельзя повесить прямо на корень этой папки: в CMS у страницы всегда есть раздел.
          Создайте подраздел (достаточно одного, например «Каталог») — внутри него будут страницы и
          кнопка «Создать страницу».
        </p>
      ) : (
        <div className="flex flex-col gap-8">
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article section pane
// ---------------------------------------------------------------------------

function ArticleSectionPane({
  sectionSlug,
  sectionTitle,
  sections,
  pagesBySectionSlug,
  ratingsById,
}: {
  sectionSlug: string;
  sectionTitle: string;
  sections: ContentHubSection[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  ratingsById?: Record<string, ContentRatingSummary>;
}) {
  const sec = sections.find((s) => s.slug === sectionSlug);
  const pages = pagesBySectionSlug[sectionSlug] ?? [];
  const newPageSystemParentCode =
    sec?.kind === "system" && sec.systemParentCode ? sec.systemParentCode : undefined;

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
  pagesBySectionSlug,
  ratingsById,
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
