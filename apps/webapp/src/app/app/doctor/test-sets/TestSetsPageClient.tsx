"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TestSet } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import { DoctorCatalogStickyToolbar } from "@/shared/ui/doctor/DoctorCatalogStickyToolbar";
import { DoctorCatalogTitleSortSelect } from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { DoctorCatalogToolbarMainRow } from "@/shared/ui/doctor/DoctorCatalogToolbarLayout";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import {
  archiveDoctorTestSetInline,
  saveDoctorTestSetInline,
  saveDoctorTestSetItemsInline,
} from "./actionsInline";
import { TestSetForm } from "./TestSetForm";
import { TestSetItemsForm } from "./TestSetItemsForm";
import { TEST_SETS_PATH } from "./paths";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";

export type TestSetTitleSort = "default" | "asc" | "desc";

type Props = {
  initialSets: TestSet[];
  initialSelectedId: string | null;
};

export function TestSetsPageClient({ initialSets, initialSelectedId }: Props) {
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<TestSetTitleSort>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<TestSet | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (initialSelectedId) {
        const found = initialSets.find((s) => s.id === initialSelectedId);
        if (found) {
          setSelectedId(found.id);
          setCreating(false);
          setMobileSheet(found);
        }
      }
    });
  }, [initialSelectedId, initialSets]);

  const displayList = useDoctorCatalogDisplayList(initialSets, searchQuery, titleSort);

  useDoctorCatalogMasterSelectionSync({
    displayList,
    setSelectedId,
    setMobileItem: setMobileSheet,
    suspend: creating,
    fallbackToFirst: false,
  });

  const selected = creating ? null : (displayList.find((s) => s.id === selectedId) ?? null);

  const renderRows = (onPick: (s: TestSet) => void, activeId: string | null) =>
    displayList.length === 0 ? (
      <p className="px-2 pb-2 text-sm text-muted-foreground">Нет наборов по заданным условиям.</p>
    ) : (
      <ul className="flex max-h-[70vh] flex-col gap-1 overflow-auto lg:max-h-none lg:overflow-visible">
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
        testSet={null}
        saveAction={saveDoctorTestSetInline}
        archiveAction={archiveDoctorTestSetInline}
        backHref={TEST_SETS_PATH}
      />
    ) : selected ? (
      <>
        <TestSetForm
          testSet={selected}
          saveAction={saveDoctorTestSetInline}
          archiveAction={archiveDoctorTestSetInline}
          backHref={TEST_SETS_PATH}
        />
        <section className="flex flex-col gap-2 border-t border-border/60 pt-6">
          <h2 className="text-lg font-medium">Состав набора</h2>
          <TestSetItemsForm testSet={selected} saveItemsAction={saveDoctorTestSetItemsInline} />
        </section>
      </>
    ) : (
      <TestSetForm
        testSet={null}
        saveAction={saveDoctorTestSetInline}
        archiveAction={archiveDoctorTestSetInline}
        backHref={TEST_SETS_PATH}
      />
    );

  const desktopRight = <CatalogRightPane>{rightInner}</CatalogRightPane>;

  const mobileDetailOpen = creating || mobileSheet != null;

  const toolbar = (
    <DoctorCatalogStickyToolbar>
      <DoctorCatalogToolbarMainRow
        start={
          <>
            <PickerSearchField
              id={searchFieldId}
              label="Поиск по названию"
              placeholder="Название набора"
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
            />
            <DoctorCatalogTitleSortSelect value={titleSort} onValueChange={(v) => setTitleSort(v as TestSetTitleSort)} />
          </>
        }
        end={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
              {displayList.length === 0 ? "Нет наборов" : `Наборов: ${displayList.length}`}
            </p>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
                setMobileSheet(null);
              }}
            >
              Создать набор
            </Button>
          </div>
        }
      />
    </DoctorCatalogStickyToolbar>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        left={
          <CatalogLeftPane>
            {renderRows((s) => {
              setCreating(false);
              setSelectedId(s.id);
              setMobileSheet(s);
            }, creating ? null : selected?.id ?? mobileSheet?.id ?? null)}
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
  );
}
