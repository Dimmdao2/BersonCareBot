'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, use, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type {
  TreatmentProgramTemplate,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateListPreviewMedia,
} from '@/modules/treatment-program/types';
import { cn } from '@/lib/utils';
import { useDoctorCatalogDisplayList } from '@/shared/hooks/useDoctorCatalogDisplayList';
import { useDoctorCatalogClientFilterMerge } from '@/shared/hooks/useDoctorCatalogClientFilterMerge';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { useDoctorCatalogMasterSelectionSync } from '@/shared/hooks/useDoctorCatalogMasterSelectionSync';
import type { CatalogMasterTitleSort } from '@/shared/ui/doctor/DoctorCatalogMasterListHeader';
import { DoctorCatalogFiltersForm } from '@/shared/ui/doctor/DoctorCatalogFiltersForm';
import { DoctorCatalogListSortHeader } from '@/shared/ui/doctor/DoctorCatalogListSortHeader';
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from '@/shared/ui/doctor/DoctorCatalogFiltersToolbar';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { DoctorCatalogMasterListRow } from '@/shared/ui/doctor/DoctorCatalogMasterListRow';
import { VirtualizedItemGrid } from '@/shared/ui/doctor/catalog/VirtualizedItemGrid';
import {
  TreatmentProgramConstructorClient,
  type TreatmentProgramLibraryPickers,
} from './[id]/TreatmentProgramConstructorClient';
import { NewTemplateForm } from './new/NewTemplateForm';
import type { DoctorCatalogPubArchQuery } from '@/shared/lib/doctorCatalogListStatus';
import { MediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import { templateListPreviewToPreviewUi } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import { DoctorCatalogInvalidPubArchToast } from '@/shared/ui/doctor/DoctorCatalogInvalidPubArchToast';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { TreatmentProgramTemplateStatusBadge } from './TreatmentProgramTemplateStatusBadge';
import { loadTreatmentProgramLibrary } from './loadTreatmentProgramLibrary';
import { readSafeApiErrorText } from '@/shared/http/apiErrorCode';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { DoctorCatalogMobileToolbar } from '@/shared/ui/doctor/DoctorCatalogMobileToolbar';
import { CatalogStatusFilters } from '@/shared/ui/doctor/CatalogStatusFilters';
import { DoctorCatalogTitleSortSelect } from '@/shared/ui/doctor/DoctorCatalogTitleSortSelect';
import { DoctorCatalogVisibilityMark } from '@/shared/ui/doctor/DoctorCatalogVisibilityMark';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';

/** Краткая строка счётчиков + подпись для aria (список шаблонов). */
function templateListCountsText(
  stageCount: number,
  itemCount: number,
): { line: string; ariaLabel: string } {
  const ru = (n: number, one: string, few: string, many: string) => {
    const m = n % 100;
    const t = n % 10;
    if (t === 1 && m !== 11) return `${n} ${one}`;
    if (t >= 2 && t <= 4 && (m < 12 || m > 14)) return `${n} ${few}`;
    return `${n} ${many}`;
  };
  const line = `${ru(stageCount, 'этап', 'этапа', 'этапов')} · ${ru(itemCount, 'элемент', 'элемента', 'элементов')}`;
  return { line, ariaLabel: `В шаблоне: ${line}` };
}

function TreatmentProgramTemplateRowPreviewMedia({
  preview,
  active,
  size = 'md',
}: {
  preview: TreatmentProgramTemplateListPreviewMedia | null;
  active: boolean;
  /** `sm` — 30px как в списке комплексов ЛФК; `md` — 40px (прежний список шаблонов). */
  size?: 'sm' | 'md';
}): ReactNode {
  const box = size === 'sm' ? 'size-[30px]' : 'size-10';
  const shellClass = cn(
    size === 'md' && 'mt-0.5',
    'flex shrink-0 overflow-hidden rounded-md border bg-muted/50',
    box,
    active && 'border-primary/20 bg-primary/10',
  );
  const iconClass = size === 'sm' ? 'size-4' : 'size-5';
  const videoSizes = size === 'sm' ? '30px' : '40px';
  if (!preview?.mediaUrl) {
    return (
      <div className={shellClass} aria-hidden>
        <div className="flex size-full items-center justify-center">
          <ClipboardList
            className={cn(iconClass, active ? 'text-primary' : 'text-muted-foreground')}
          />
        </div>
      </div>
    );
  }
  return (
    <div className={shellClass} aria-hidden>
      <MediaThumb
        media={templateListPreviewToPreviewUi(preview)}
        className="size-full"
        imgClassName="size-full object-cover"
        sizes={videoSizes}
      />
    </div>
  );
}

function CatalogSplitLayoutSkeleton() {
  return <DoctorPanelLoading className="min-h-48" />;
}

type Props = {
  templatesPromise: Promise<TreatmentProgramTemplate[]>;
  initialSelectedId: string | null;
  filters: {
    q: string;
    listPubArch: DoctorCatalogPubArchQuery;
  };
  initialTitleSort: 'asc' | 'desc' | null;
};

type ContentProps = Props & {
  titleSort: CatalogMasterTitleSort | null;
  setTitleSort: (next: CatalogMasterTitleSort | null) => void;
  isListPending: boolean;
  startListTransition: (fn: () => void) => void;
  formKey: string;
};

function TreatmentProgramTemplatesContent({
  templatesPromise,
  initialSelectedId,
  filters,
  titleSort,
  setTitleSort,
  isListPending,
  startListTransition,
  formKey,
}: ContentProps) {
  const router = useRouter();
  const templates = use(templatesPromise);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<TreatmentProgramTemplate | null>(null);
  const [detail, setDetail] = useState<TreatmentProgramTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [library, setLibrary] = useState<TreatmentProgramLibraryPickers | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const isDesktopViewport = useViewportMinWidth(1024);
  const detailFetchGenRef = useRef(0);
  const libraryFetchGenRef = useRef(0);

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  useEffect(() => {
    queueMicrotask(() => {
      if (!initialSelectedId) return;
      const found = templates.find((t) => t.id === initialSelectedId);
      if (found) {
        setCreating(false);
        setSelectedId(found.id);
        setMobileSheet(found);
      }
    });
  }, [initialSelectedId, templates]);

  const displayList = useDoctorCatalogDisplayList(
    templates,
    mergedFilters.q,
    mergedFilters.titleSort === null ? 'default' : mergedFilters.titleSort,
  );

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((t) => t.id === selectedId) ?? null);

  const titleSortForHeader: CatalogMasterTitleSort | null =
    mergedFilters.titleSort === 'asc' || mergedFilters.titleSort === 'desc'
      ? mergedFilters.titleSort
      : null;

  const changeTitleSort = (next: CatalogMasterTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  // Prefetch constructor library in parallel with detail when a template is selected.
  useEffect(() => {
    if (!selected?.id) return;
    if (library) return;
    const gen = ++libraryFetchGenRef.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || gen !== libraryFetchGenRef.current) return;
      setLibraryLoading(true);
      setLibraryError(null);
    });
    void loadTreatmentProgramLibrary()
      .then((lib) => {
        if (cancelled || gen !== libraryFetchGenRef.current) return;
        setLibrary(lib);
      })
      .catch(() => {
        if (cancelled || gen !== libraryFetchGenRef.current) return;
        setLibraryError('Не удалось загрузить библиотеку конструктора');
      })
      .finally(() => {
        if (cancelled || gen !== libraryFetchGenRef.current) return;
        setLibraryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, library]);

  useEffect(() => {
    const id = selected?.id;
    if (!id) {
      queueMicrotask(() => {
        setDetail(null);
        setDetailError(null);
        setDetailLoading(false);
      });
      return;
    }
    const gen = ++detailFetchGenRef.current;
    const ac = new AbortController();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || gen !== detailFetchGenRef.current) return;
      setDetailLoading(true);
      setDetailError(null);
    });
    void fetch(`/api/doctor/treatment-program-templates/${id}`, { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          item?: TreatmentProgramTemplateDetail;
          error?: string;
        };
        if (cancelled || gen !== detailFetchGenRef.current) return;
        if (json.ok && json.item) {
          setDetail(json.item);
        } else {
          setDetail(null);
          setDetailError(readSafeApiErrorText(json, 'Не удалось загрузить шаблон'));
        }
      })
      .catch((err: unknown) => {
        if (cancelled || gen !== detailFetchGenRef.current) return;
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (aborted) return;
        setDetail(null);
        setDetailError('Ошибка загрузки');
      })
      .finally(() => {
        if (cancelled || gen !== detailFetchGenRef.current) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [selected?.id]);

  const renderRows = (onPick: (t: TreatmentProgramTemplate) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <DoctorEmptyState>Нет шаблонов по заданным условиям.</DoctorEmptyState>
    ) : (
      <VirtualizedItemGrid
        items={displayList}
        columns={1}
        estimatedRowHeight={56}
        overscan={4}
        keyExtractor={(t) => t.id}
        containerClassName="h-full min-h-0"
        gridClassName="gap-0 p-0"
        renderItem={(t, index) => {
          const active = activeId === t.id;
          const counts = templateListCountsText(t.stageCount, t.itemCount);
          return (
            <DoctorCatalogMasterListRow
              first={index === 0}
              active={active}
              onPick={() => onPick(t)}
              previewInner={
                <TreatmentProgramTemplateRowPreviewMedia
                  preview={t.listPreviewMedia}
                  active={active}
                  size="sm"
                />
              }
              title={t.title}
              meta={
                <span aria-label={counts.ariaLabel} className={cn(active && 'text-primary/80')}>
                  {counts.line}
                </span>
              }
              badge={<DoctorCatalogVisibilityMark status={t.status} />}
            />
          );
        }}
      />
    );

  const renderRightInner = (modalFooter = false) => {
    if (!selected) {
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Новый шаблон программы</p>
          <p className="text-sm text-muted-foreground">
            Задайте название и откройте конструктор этапов.
          </p>
          <NewTemplateForm
            showCancelLink={false}
            showStatusField={false}
            titleInputId={modalFooter ? 'tpl-title-catalog-mobile' : 'tpl-title-catalog-inline'}
            modalFooter={modalFooter}
            onCreated={
              modalFooter
                ? (id) => {
                    setCreating(false);
                    setSelectedId(id);
                    setMobileSheet(null);
                    router.refresh();
                  }
                : undefined
            }
          />
        </div>
      );
    }
    if (detailLoading || libraryLoading) {
      return <DoctorPanelLoading className="min-h-48" />;
    }
    if (detailError) {
      return <p className="text-sm text-destructive">{detailError}</p>;
    }
    if (libraryError) {
      return <p className="text-sm text-destructive">{libraryError}</p>;
    }
    if (detail && library) {
      return (
        <TreatmentProgramConstructorClient
          templateId={selected.id}
          initialDetail={detail}
          library={library}
          onArchived={() => {
            router.refresh();
            setCreating(false);
            setSelectedId(null);
            setMobileSheet(null);
            setDetail(null);
          }}
          modalFooter={modalFooter}
        />
      );
    }
    return <DoctorPanelLoading className="min-h-48" />;
  };

  const desktopRight = (
    <CatalogRightPane className="h-full">
      {isDesktopViewport ? renderRightInner() : null}
    </CatalogRightPane>
  );

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      // Тулбар живёт внутри `DoctorCatalogPageLayout`, а тот уже начинается ПОД шапкой страницы.
      // Без этого флага офсет шапки резервируется второй раз и липкая полоска сползает
      // на 44px вниз — ровно на шапку master-списка, перехватывая клики по сортировке,
      // фильтру архива и переключателю список/плитки.
      withinRemainingHeight
      className="hidden md:block"
      filters={
        <DoctorCatalogToolbarFiltersSlot>
          <DoctorCatalogFiltersForm
            idPrefix={`${formKey}-tpt`}
            q={mergedFilters.q}
            showRegionFilter={false}
            showLoadFilter={false}
            titleSort={mergedFilters.titleSort}
            selectedId={selectedId}
            catalogPubArch={mergedFilters.listPubArch}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <Button
          type="button"
          className={doctorCatalogToolbarPrimaryActionClassName}
          id="doctor-treatment-program-templates-new"
          onClick={openNewTemplate}
        >
          Создать
        </Button>
      }
    />
  );

  function openNewTemplate() {
    setCreating(true);
    setSelectedId(null);
    setMobileSheet(null);
  }

  const pickTemplate = (template: TreatmentProgramTemplate) => {
    setCreating(false);
    setSelectedId(template.id);
    if (!isDesktopViewport) setMobileSheet(template);
  };

  const mobileSearch = (
    <DoctorCatalogFiltersForm
      idPrefix={`${formKey}-tpt-mobile-search`}
      q={mergedFilters.q}
      showRegionFilter={false}
      showLoadFilter={false}
      titleSort={mergedFilters.titleSort}
      catalogPubArch={mergedFilters.listPubArch}
      presentation="search-only"
    />
  );

  const mobileFilters = (
    <>
      <DoctorCatalogTitleSortSelect
        value={titleSortForHeader ?? 'default'}
        onValueChange={(value) => changeTitleSort(value === 'default' ? null : value)}
        className="w-full max-w-none"
      />
      <CatalogStatusFilters
        value={mergedFilters.listPubArch}
        extraParams={{ titleSort: mergedFilters.titleSort }}
        className="flex-col items-stretch [&>div]:w-full [&>div]:max-w-none"
      />
    </>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar} mobileEdgeToEdge>
      <CatalogSplitLayout
        className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            mobileEdgeToEdge
            headerSlot={
              <DoctorCatalogListSortHeader
                summaryLine={
                  displayList.length === 0 ? 'Нет шаблонов' : `Шаблонов: ${displayList.length}`
                }
                titleSort={titleSortForHeader}
                onTitleSortChange={changeTitleSort}
                catalogPubArch={mergedFilters.listPubArch}
                archiveScopeExtraParams={{
                  titleSort: mergedFilters.titleSort,
                }}
              />
            }
          >
            <div
              className={cn(
                'min-h-0 flex-1 overflow-hidden transition-opacity',
                isListPending && 'opacity-80',
              )}
              aria-busy={isListPending}
            >
              {renderRows(
                pickTemplate,
                creating ? null : (selected?.id ?? mobileSheet?.id ?? null),
              )}
            </div>
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView="list"
      />
      <DoctorCatalogMobileToolbar
        search={mobileSearch}
        filters={mobileFilters}
        filterActive={Boolean(
          mergedFilters.titleSort ||
          mergedFilters.listPubArch.arch !== 'active' ||
          mergedFilters.listPubArch.pub !== 'all',
        )}
        onCreate={openNewTemplate}
        createLabel="Новый шаблон программы"
      />
      <DoctorModal
        open={!isDesktopViewport && mobileDetailOpen}
        onClose={() => {
          setMobileSheet(null);
          setCreating(false);
        }}
        title={creating ? 'Новый шаблон программы' : (mobileSheet?.title ?? 'Шаблон программы')}
        size="content"
        desktopPresentation="right-sheet"
      >
        {!isDesktopViewport && mobileDetailOpen ? renderRightInner(true) : null}
      </DoctorModal>
    </DoctorCatalogPageLayout>
  );
}

export function TreatmentProgramTemplatesPageClient({
  templatesPromise,
  initialSelectedId,
  filters,
  initialTitleSort,
}: Props) {
  const formKey = useId();
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(initialTitleSort);
  const [isListPending, startListTransition] = useTransition();

  useEffect(() => {
    setTitleSort(initialTitleSort);
  }, [initialTitleSort]);

  return (
    <>
      <DoctorCatalogInvalidPubArchToast />
      <Suspense fallback={<CatalogSplitLayoutSkeleton />}>
        <TreatmentProgramTemplatesContent
          templatesPromise={templatesPromise}
          initialSelectedId={initialSelectedId}
          filters={filters}
          initialTitleSort={initialTitleSort}
          titleSort={titleSort}
          setTitleSort={setTitleSort}
          isListPending={isListPending}
          startListTransition={startListTransition}
          formKey={formKey}
        />
      </Suspense>
    </>
  );
}
