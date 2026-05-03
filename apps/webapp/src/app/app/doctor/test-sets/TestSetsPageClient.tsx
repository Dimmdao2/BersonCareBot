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
  saveDoctorTestSetItemsInline,
  unarchiveDoctorTestSetInline,
} from "./actionsInline";
import type { DoctorCatalogPubArchQuery } from "@/shared/lib/doctorCatalogListStatus";
import { DoctorCatalogInvalidPubArchToast } from "@/shared/ui/doctor/DoctorCatalogInvalidPubArchToast";
import type { ClinicalTestLibraryPickRow } from "./clinicalTestLibraryRows";
import { TestSetForm } from "./TestSetForm";
import { TestSetItemsForm } from "./TestSetItemsForm";
import { TEST_SETS_PATH } from "./paths";

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
          return (
            <li key={s.id} className="rounded-md border border-border/40 bg-card/30">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  onPick(s);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/80",
                  active &&
                    "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                )}
              >
                <span className="line-clamp-2 font-medium leading-tight">{s.title}</span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    active ? "text-primary/70" : "text-muted-foreground",
                  )}
                >
                  Тестов в наборе: {s.items.length}
                  {s.isArchived ? " · в архиве" : ""}
                  {s.publicationStatus === "published" ? " · опубликован" : " · черновик"}
                </span>
              </button>
            </li>
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
          backHref={TEST_SETS_PATH}
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
          backHref={TEST_SETS_PATH}
          externalUsageSnapshot={usageForSelection}
        />
        <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <h2 className="text-lg font-medium">Состав набора</h2>
          {!selected.isArchived ? (
            <TestSetItemsForm
              testSet={selected}
              clinicalTestsLibrary={clinicalTestsLibrary}
              saveItemsAction={saveDoctorTestSetItemsInline}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Состав недоступен, пока набор в архиве.</p>
          )}
        </section>
      </div>
    ) : (
      <TestSetForm
        key="empty"
        testSet={null}
        saveAction={saveDoctorTestSetInline}
        archiveAction={archiveDoctorTestSetInline}
        backHref={TEST_SETS_PATH}
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
