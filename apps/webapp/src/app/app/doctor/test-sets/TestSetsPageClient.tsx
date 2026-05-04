"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { TestSet, TestSetUsageSnapshot } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogClientFilterMerge } from "@/shared/hooks/useDoctorCatalogClientFilterMerge";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { DoctorCatalogListSortHeader } from "@/shared/ui/doctor/DoctorCatalogListSortHeader";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { DoctorCatalogFiltersForm } from "@/shared/ui/doctor/DoctorCatalogFiltersForm";
import {
  archiveDoctorTestSetInline,
  saveDoctorTestSetInline,
  unarchiveDoctorTestSetInline,
} from "./actionsInline";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import { DoctorCatalogInvalidPubArchToast } from "@/shared/ui/doctor/DoctorCatalogInvalidPubArchToast";
import { DoctorCatalogMasterListRow } from "@/shared/ui/doctor/DoctorCatalogMasterListRow";
import { MediaThumb } from "@/shared/ui/media/MediaThumb";
import { clinicalTestMediaItemToPreviewUi } from "@/shared/ui/media/mediaPreviewUiModel";
import type { ClinicalTestLibraryPickRow } from "./clinicalTestLibraryRows";
import { TestSetForm } from "./TestSetForm";
import { TestSetMasterListStatusBadge } from "./TestSetMasterListStatusBadge";

type Props = {
  initialSets: TestSet[];
  initialSelectedId: string | null;
  initialSelectedUsageSnapshot: TestSetUsageSnapshot | null;
  clinicalTestsLibrary: ClinicalTestLibraryPickRow[];
  bodyRegionIdToCode: Record<string, string>;
  filters: {
    q: string;
    regionCode?: string;
    listPubArch: DoctorCatalogPubArchQuery;
  };
};

export function TestSetsPageClient({
  initialSets,
  initialSelectedId,
  initialSelectedUsageSnapshot,
  clinicalTestsLibrary,
  bodyRegionIdToCode,
  filters,
}: Props) {
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(null);
  const [isListPending, startListTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<TestSet | null>(null);

  const filterScope = useMemo(() => ({ ...filters, titleSort }), [filters, titleSort]);
  const mergedFilters = useDoctorCatalogClientFilterMerge(filterScope);

  useEffect(() => {
    if (!initialSelectedId) return;
    const found = initialSets.find((s) => s.id === initialSelectedId);
    if (!found) return;
    queueMicrotask(() => {
      setSelectedId(found.id);
      setCreating(false);
      setMobileSheet(found);
    });
  }, [initialSelectedId, initialSets]);

  const qSorted = useDoctorCatalogDisplayList(
    initialSets,
    mergedFilters.q,
    mergedFilters.titleSort === null ? "default" : mergedFilters.titleSort,
  );

  const displayList = useMemo(() => {
    const rc = mergedFilters.regionCode?.trim();
    if (!rc) return qSorted;
    return qSorted.filter((s) =>
      s.items.some((it) => {
        const bid = it.test.bodyRegionId;
        return Boolean(bid && bodyRegionIdToCode[bid] === rc);
      }),
    );
  }, [qSorted, mergedFilters.regionCode, bodyRegionIdToCode]);

  const titleSortForHeader: CatalogMasterTitleSort | null =
    mergedFilters.titleSort === "asc" || mergedFilters.titleSort === "desc" ? mergedFilters.titleSort : null;

  const changeTitleSort = (next: CatalogMasterTitleSort | null) => {
    startListTransition(() => {
      setTitleSort(next);
    });
  };

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((s) => s.id === selectedId) ?? null);

  const usageForSelection = (() => {
    const current = mobileSheet ?? selected;
    if (!current || initialSelectedUsageSnapshot == null) return undefined;
    if (initialSelectedId === current.id) return initialSelectedUsageSnapshot;
    return undefined;
  })();

  const renderRows = (onPick: (s: TestSet) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="text-sm text-muted-foreground">Нет наборов по заданным условиям.</p>
    ) : (
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {displayList.map((s) => {
          const active = activeId === s.id;
          const sortedItems = [...s.items].sort((a, b) => a.sortOrder - b.sortOrder);
          const previewItems = sortedItems.filter((it) => Boolean(it.test.previewMedia?.mediaUrl));
          const previewInner =
            previewItems.length === 0 ? (
              <span
                className={cn(
                  "self-center text-[11px] leading-none",
                  active ? "text-primary/75" : "text-muted-foreground",
                )}
              >
                Нет превью
              </span>
            ) : (
              <>
                {previewItems.slice(0, 12).map((it) => {
                  const m = it.test.previewMedia!;
                  return (
                    <div
                      key={it.id}
                      className="relative size-[30px] shrink-0 overflow-hidden rounded border border-border/50 bg-muted/30"
                    >
                      <MediaThumb
                        media={clinicalTestMediaItemToPreviewUi(m)}
                        className="size-full"
                        imgClassName="size-full object-cover"
                        sizes="30px"
                      />
                    </div>
                  );
                })}
              </>
            );
          return (
            <DoctorCatalogMasterListRow
              key={s.id}
              active={active}
              onPick={() => {
                setCreating(false);
                onPick(s);
              }}
              previewInner={previewInner}
              title={s.title}
              meta={<>Тестов в наборе: {s.items.length}</>}
              badge={
                <TestSetMasterListStatusBadge
                  publicationStatus={s.publicationStatus}
                  isArchived={s.isArchived}
                  className="w-full justify-center text-[10px] leading-tight"
                />
              }
            />
          );
        })}
      </ul>
    );

  const rightInner =
    creating ? (
        <TestSetForm
          key="create"
          testSet={null}
          saveAction={saveDoctorTestSetInline}
          archiveAction={archiveDoctorTestSetInline}
          clinicalTestsLibrary={clinicalTestsLibrary}
        />
    ) : selected ? (
      <div key={selected.id} className="flex max-w-2xl flex-col gap-4">
        <TestSetForm
          testSet={selected}
          saveAction={saveDoctorTestSetInline}
          archiveAction={archiveDoctorTestSetInline}
          unarchiveAction={unarchiveDoctorTestSetInline}
          workspaceListPreserve={{
            q: mergedFilters.q,
            titleSort: mergedFilters.titleSort,
            regionCode: mergedFilters.regionCode,
            listPubArch: mergedFilters.listPubArch,
          }}
          externalUsageSnapshot={usageForSelection}
          clinicalTestsLibrary={clinicalTestsLibrary}
        />
      </div>
    ) : (
      <TestSetForm
        key="empty"
        testSet={null}
        saveAction={saveDoctorTestSetInline}
        archiveAction={archiveDoctorTestSetInline}
        clinicalTestsLibrary={clinicalTestsLibrary}
      />
    );

  const desktopRight = <CatalogRightPane className="h-full">{rightInner}</CatalogRightPane>;

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <DoctorCatalogFiltersToolbar
      filters={
        <DoctorCatalogToolbarFiltersSlot>
          <DoctorCatalogFiltersForm
            idPrefix="ts"
            q={mergedFilters.q}
            regionCode={mergedFilters.regionCode}
            showLoadFilter={false}
            titleSort={mergedFilters.titleSort}
            selectedId={creating ? null : selected?.id ?? mobileSheet?.id ?? null}
            catalogPubArch={mergedFilters.listPubArch}
          />
        </DoctorCatalogToolbarFiltersSlot>
      }
      end={
        <button
          type="button"
          className={doctorCatalogToolbarPrimaryActionClassName}
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setMobileSheet(null);
          }}
        >
          Создать
        </button>
      }
    />
  );

  return (
    <>
      <DoctorCatalogInvalidPubArchToast />
      <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        className="lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-3.25rem-1rem)] lg:overflow-hidden"
        left={
          <CatalogLeftPane
            stickySplit={false}
            stickyToolbarRows={1}
            className="h-full"
            headerSlot={
              <DoctorCatalogListSortHeader
                summaryLine={
                  displayList.length === 0 ? "Нет наборов" : `Наборов: ${displayList.length}`
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
                "min-h-0 flex-1 overflow-hidden transition-opacity",
                isListPending && "opacity-80",
              )}
              aria-busy={isListPending}
            >
              {renderRows((s) => {
                setCreating(false);
                setSelectedId(s.id);
                setMobileSheet(s);
              }, creating ? null : selected?.id ?? mobileSheet?.id ?? null)}
            </div>
          </CatalogLeftPane>
        }
        right={desktopRight}
        mobileView={mobileDetailOpen ? "detail" : "list"}
        mobileBackSlot={
          mobileDetailOpen ? (
            <Button
              variant="ghost"
              type="button"
              className="mb-2 h-9 px-2"
              onClick={() => {
                setMobileSheet(null);
                setCreating(false);
              }}
            >
              ← Назад
            </Button>
          ) : null
        }
      />
    </DoctorCatalogPageLayout>
    </>
  );
}
