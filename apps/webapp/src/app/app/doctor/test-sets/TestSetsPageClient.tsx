"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DOCTOR_CATALOG_TEMPLATE_STATUS_FILTER_OPTIONS,
  type DoctorCatalogListStatus,
} from "@/shared/lib/doctorCatalogListStatus";
import type { TestSet } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import type { CatalogMasterTitleSort } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { DoctorCatalogListSortHeader } from "@/shared/ui/doctor/DoctorCatalogListSortHeader";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import { Input } from "@/components/ui/input";
import {
  doctorCatalogToolbarPrimaryActionClassName,
  DoctorCatalogFiltersToolbar,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { DoctorCatalogToolbarChoiceInput } from "@/shared/ui/doctor/DoctorCatalogToolbarChoiceInput";
import {
  archiveDoctorTestSetInline,
  saveDoctorTestSetInline,
  saveDoctorTestSetItemsInline,
} from "./actionsInline";
import { TestSetForm } from "./TestSetForm";
import { TestSetItemsForm } from "./TestSetItemsForm";
import { TEST_SETS_PATH } from "./paths";
type Props = {
  initialSets: TestSet[];
  initialSelectedId: string | null;
  initialCatalogStatus: DoctorCatalogListStatus;
};

export function TestSetsPageClient({
  initialSets,
  initialSelectedId,
  initialCatalogStatus,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<CatalogMasterTitleSort | null>(null);
  const [isListPending, startListTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<TestSet | null>(null);

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

  function applyCatalogStatus(next: DoctorCatalogListStatus) {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("scope");
    p.set("status", next);
    const qs = p.toString();
    router.replace(qs ? `/app/doctor/test-sets?${qs}` : "/app/doctor/test-sets");
  }

  const displayList = useDoctorCatalogDisplayList(
    initialSets,
    searchQuery,
    titleSort === null ? "default" : titleSort,
  );

  const titleSortForHeader: CatalogMasterTitleSort | null =
    titleSort === "asc" || titleSort === "desc" ? titleSort : null;

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
      <div key={selected.id} className="flex max-w-2xl flex-col gap-6">
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <DoctorCatalogToolbarChoiceInput
            id={`${searchFieldId}-scope`}
            aria-label="Статус списка"
            value={initialCatalogStatus}
            onValueChange={(v) => applyCatalogStatus(v as DoctorCatalogListStatus)}
            options={DOCTOR_CATALOG_TEMPLATE_STATUS_FILTER_OPTIONS}
          />
          <div className="w-[220px] shrink-0">
            <label htmlFor={searchFieldId} className="sr-only">
              Поиск по названию
            </label>
            <Input
              id={searchFieldId}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию"
              autoComplete="off"
              className="w-full"
            />
          </div>
        </div>
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
  );
}
