'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  isSectionSlugProtectedFromDelete,
  isSystemParentCode,
} from '@/modules/content-sections/types';
import type { ContentSectionRow } from '@/modules/content-sections/ports';
import type { SystemParentCode } from '@/modules/content-sections/types';
import { DataLoadFailureNotice } from '@/shared/ui/doctor/DataLoadFailureNotice';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ContentNav, useContentNavState, type ContentNavSectionEntry } from './ContentNav';
import { ContentPagesSectionList, type ContentPageListRow } from './ContentPagesSectionList';
import type { ContentRatingSummary } from './ContentRatingChip';
import { ContentForm, type PublishedCourseOption } from './ContentForm';
import { AttachExistingSectionsModal } from './AttachExistingSectionsModal';
import { useInlineContentEditor, ContentEditorRightPane } from './ContentEditorRightPane';
import { SYSTEM_PARENT_CODES } from '@/modules/content-sections/types';
import { SectionForm } from './sections/SectionForm';
import { contentMobileBackTarget } from './contentMobileBack';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentHubSection = {
  slug: string;
  title: string;
  isVisible: boolean;
  kind: ContentSectionRow['kind'];
  systemParentCode: ContentSectionRow['systemParentCode'];
  sortOrder: number;
};

export type ContentHubShellProps = {
  sections: ContentHubSection[];
  canManageCms: boolean;
  patientHomeTodayEnabled: boolean;
  warmupsEnabled: boolean;
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
  situations: 'Ситуации',
  sos: 'SOS',
  warmups: 'Разминки',
  lessons: 'Уроки · Новости · Мотивации',
};

function SystemFolderPane({
  folderCode,
  sections,
  pagesBySectionSlug,
  ratingsById,
  selectedPageId,
  onSelectPage,
  onCreatePage,
  canManageCms,
}: {
  folderCode: SystemParentCode;
  sections: ContentHubSection[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  ratingsById?: Record<string, ContentRatingSummary>;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onCreatePage: (sectionSlug: string) => void;
  canManageCms: boolean;
}) {
  const label = SYSTEM_FOLDER_LABELS[folderCode] ?? folderCode;
  const childSections = useMemo(
    () =>
      sections
        .filter((s) => s.kind === 'system' && s.systemParentCode === folderCode)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru')),
    [sections, folderCode],
  );

  const freeSections = useMemo(
    () =>
      sections
        .filter((s) => s.kind === 'article')
        .map((s) => ({ slug: s.slug, title: s.title }))
        .sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    [sections],
  );

  const folderHeader = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 text-base font-semibold">{label}</h2>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {canManageCms ? (
          <AttachExistingSectionsModal folderCode={folderCode} freeSections={freeSections} />
        ) : null}
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

  return (
    <div className="flex flex-col gap-4">
      {folderHeader}
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
              sectionSettingsHref={
                canManageCms
                  ? `/app/doctor/content/sections/edit/${encodeURIComponent(sec.slug)}`
                  : undefined
              }
              allowDeleteSection={canManageCms && !isSectionSlugProtectedFromDelete(sec.slug)}
              pagesInSectionCount={rows.length}
              selectedPageId={selectedPageId}
              onSelectPage={canManageCms ? onSelectPage : undefined}
              onCreatePage={canManageCms ? onCreatePage : undefined}
              canManageCms={canManageCms}
            />
          );
        })}
      </div>
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
  selectedPageId,
  onSelectPage,
  onCreatePage,
  canManageCms,
}: {
  sectionSlug: string;
  sectionTitle: string;
  sections: ContentHubSection[];
  pagesBySectionSlug: Record<string, ContentPageListRow[]>;
  ratingsById?: Record<string, ContentRatingSummary>;
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onCreatePage: (sectionSlug: string) => void;
  canManageCms: boolean;
}) {
  const sec = sections.find((s) => s.slug === sectionSlug);
  const pages = pagesBySectionSlug[sectionSlug] ?? [];
  const newPageSystemParentCode =
    sec?.kind === 'system' && sec.systemParentCode ? sec.systemParentCode : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">{sectionTitle}</h2>
        {canManageCms ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onCreatePage(sectionSlug)}
          >
            Создать страницу
          </Button>
        ) : null}
      </div>
      <ContentPagesSectionList
        sectionSlug={sectionSlug}
        sectionTitle={sectionTitle}
        initialPages={pages}
        ratingsById={ratingsById}
        showSectionHeading={false}
        newPageSystemParentCode={newPageSystemParentCode}
        sectionSettingsHref={
          canManageCms
            ? `/app/doctor/content/sections/edit/${encodeURIComponent(sectionSlug)}`
            : undefined
        }
        allowDeleteSection={canManageCms && !isSectionSlugProtectedFromDelete(sectionSlug)}
        pagesInSectionCount={pages.length}
        selectedPageId={selectedPageId}
        onSelectPage={canManageCms ? onSelectPage : undefined}
        onCreatePage={canManageCms ? onCreatePage : undefined}
        canManageCms={canManageCms}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Count computation helper (#2)
// ---------------------------------------------------------------------------

function computeCountsByPaneKey(
  sections: ContentHubSection[],
  pagesBySectionSlug: Record<string, ContentPageListRow[]>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  // System folder pane keys: sum pages across all child subsections
  for (const code of SYSTEM_PARENT_CODES) {
    const childSlugs = sections
      .filter((s) => s.kind === 'system' && s.systemParentCode === code)
      .map((s) => s.slug);
    counts[code] = childSlugs.reduce(
      (sum, slug) => sum + (pagesBySectionSlug[slug]?.length ?? 0),
      0,
    );
  }

  // Article section pane keys: direct pages for that slug
  for (const sec of sections) {
    if (sec.kind === 'article') {
      counts[`section:${sec.slug}`] = pagesBySectionSlug[sec.slug]?.length ?? 0;
    }
  }

  return counts;
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
  canManageCms,
  patientHomeTodayEnabled,
  warmupsEnabled,
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
        .filter((s) => s.kind === 'article')
        .map((s) => ({ slug: s.slug, title: s.title, isVisible: s.isVisible })),
    [sections],
  );

  const countsByPaneKey = useMemo(
    () => computeCountsByPaneKey(sections, pagesBySectionSlug),
    [sections, pagesBySectionSlug],
  );

  const { activePaneKey, setActivePaneKey } = useContentNavState(articleSectionEntries);
  const router = useRouter();
  const editor = useInlineContentEditor();

  const [creatingSection, setCreatingSection] = useState(false);
  const [creatingPageSection, setCreatingPageSection] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const renderLeftPanel = () => {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
        <ContentNav
          articleSections={articleSectionEntries}
          canManageCms={canManageCms}
          patientHomeTodayEnabled={patientHomeTodayEnabled}
          warmupsEnabled={warmupsEnabled}
          activePaneKey={activePaneKey}
          onPaneChange={(key) => {
            setActivePaneKey(key);
            setCreatingSection(false);
            setCreatingPageSection(null);
            editor.clear();
            setMobileDetail(true);
          }}
          countsByPaneKey={countsByPaneKey}
          onCreateSection={() => {
            editor.clear();
            setCreatingSection(true);
            setCreatingPageSection(null);
            setMobileDetail(true);
          }}
          className="md:w-full"
        />
      </div>
    );
  };

  const renderMaterialsPanel = () => {
    if (loadError) {
      return (
        <p className="px-2 text-xs text-muted-foreground">
          Список материалов недоступен из-за ошибки загрузки.
        </p>
      );
    }

    if (isSystemParentCode(activePaneKey)) {
      return (
        <SystemFolderPane
          folderCode={activePaneKey}
          canManageCms={canManageCms}
          sections={sections}
          pagesBySectionSlug={pagesBySectionSlug}
          ratingsById={ratingsById}
          selectedPageId={editor.selectedPageId}
          onSelectPage={editor.select}
          onCreatePage={(sectionSlug) => {
            editor.clear();
            setCreatingSection(false);
            setCreatingPageSection(sectionSlug);
            setMobileDetail(true);
          }}
        />
      );
    }

    if (activePaneKey.startsWith('section:')) {
      const slug = activePaneKey.slice('section:'.length);
      const sec = sections.find((s) => s.slug === slug);
      if (!sec) {
        return <p className="px-2 text-xs text-muted-foreground">Раздел не найден.</p>;
      }
      return (
        <ArticleSectionPane
          sectionSlug={slug}
          sectionTitle={sec.title}
          canManageCms={canManageCms}
          sections={sections}
          pagesBySectionSlug={pagesBySectionSlug}
          ratingsById={ratingsById}
          selectedPageId={editor.selectedPageId}
          onSelectPage={editor.select}
          onCreatePage={(sectionSlug) => {
            editor.clear();
            setCreatingSection(false);
            setCreatingPageSection(sectionSlug);
            setMobileDetail(true);
          }}
        />
      );
    }

    return <p className="px-2 text-xs text-muted-foreground">Выберите раздел.</p>;
  };

  const renderRightPanel = () => {
    if (loadError) {
      return (
        <DataLoadFailureNotice
          digest={loadError.digest}
          devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
        />
      );
    }

    if (creatingSection) {
      return (
        <SectionForm
          onSaved={() => {
            router.refresh();
            setCreatingSection(false);
          }}
        />
      );
    }

    if (creatingPageSection) {
      return (
        <ContentForm
          key={`create-${creatingPageSection}`}
          sections={fullSections}
          initialSectionSlug={creatingPageSection}
          sectionSelectReadOnly
          publishedCourses={publishedCourses}
          compact
          onBack={() => setCreatingPageSection(null)}
        />
      );
    }

    if (!editor.selectedPageId) return renderMaterialsPanel();

    return (
      <ContentEditorRightPane
        selectedPageId={editor.selectedPageId}
        loadedPage={editor.loadedPage}
        loading={editor.loading}
        clear={editor.clear}
        sections={fullSections}
        publishedCourses={publishedCourses}
      />
    );
  };

  return (
    <>
      <DoctorPageHeader id="doctor-content-header" title="Контент" />
      <CatalogSplitLayout
        left={
          <CatalogLeftPane stickySplit={false} className="lg:h-full">
            {renderLeftPanel()}
          </CatalogLeftPane>
        }
        right={
          <CatalogRightPane contentClassName="px-4 py-4 md:px-5 md:py-5">
            {renderRightPanel()}
          </CatalogRightPane>
        }
        mobileView={
          mobileDetail || creatingSection || creatingPageSection || editor.selectedPageId
            ? 'detail'
            : 'list'
        }
        mobileBackSlot={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-2"
            onClick={() => {
              const target = contentMobileBackTarget({
                editingPage: editor.selectedPageId !== null,
                creatingPage: creatingPageSection !== null,
              });
              if (target === 'materials' && editor.selectedPageId) {
                editor.clear();
                setMobileDetail(true);
                return;
              }
              if (target === 'materials' && creatingPageSection) {
                setCreatingPageSection(null);
                setMobileDetail(true);
                return;
              }
              setCreatingSection(false);
              setMobileDetail(false);
            }}
          >
            ← {editor.selectedPageId || creatingPageSection ? 'К материалам' : 'К разделам'}
          </Button>
        }
        className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
        desktopColsClassName="lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.7fr)]"
      />
    </>
  );
}
