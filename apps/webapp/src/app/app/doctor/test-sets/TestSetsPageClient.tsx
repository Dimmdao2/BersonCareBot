"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import type { TestSet, TestSetArchiveScope } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { useDoctorCatalogDisplayList } from "@/shared/hooks/useDoctorCatalogDisplayList";
import { useDoctorCatalogMasterSelectionSync } from "@/shared/hooks/useDoctorCatalogMasterSelectionSync";
import {
  DoctorCatalogTitleSortSelect,
  type TitleSortValue,
} from "@/shared/ui/doctor/DoctorCatalogTitleSortSelect";
import { CatalogLeftPane } from "@/shared/ui/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/CatalogSplitLayout";
import { DoctorCatalogPageLayout } from "@/shared/ui/DoctorCatalogPageLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  archiveDoctorTestSetInline,
  saveDoctorTestSetInline,
  saveDoctorTestSetItemsInline,
} from "./actionsInline";
import { TestSetForm } from "./TestSetForm";
import { TestSetItemsForm } from "./TestSetItemsForm";
import { TEST_SETS_PATH } from "./paths";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";

const SCOPE_FILTER_LABELS: Record<string, string> = {
  active: "Активные",
  all: "Все",
  archived: "Архив",
};

type Props = {
  initialSets: TestSet[];
  initialSelectedId: string | null;
  initialArchiveScope: TestSetArchiveScope;
};

export function TestSetsPageClient({
  initialSets,
  initialSelectedId,
  initialArchiveScope,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFieldId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [titleSort, setTitleSort] = useState<TitleSortValue>("default");
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

  const scopeSelectValue = initialArchiveScope;

  function applyArchiveScope(next: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (next == null || next === "" || next === "active") {
      p.delete("scope");
    } else {
      p.set("scope", next);
    }
    const qs = p.toString();
    router.replace(qs ? `/app/doctor/test-sets?${qs}` : "/app/doctor/test-sets");
  }

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
    <div className={cn(DOCTOR_CATALOG_STICKY_BAR_CLASS, DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem]">
            <span className="text-[11px] text-muted-foreground sm:sr-only">Наборы</span>
            <Select value={scopeSelectValue} onValueChange={applyArchiveScope}>
              <SelectTrigger size="sm" className="w-full max-w-full text-left">
                <SelectValue placeholder="Активные">
                  {(val: unknown) => {
                    const key = val == null || val === "" ? "active" : String(val);
                    return SCOPE_FILTER_LABELS[key] ?? SCOPE_FILTER_LABELS.active;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="archived">Архив</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 sm:max-w-[14rem]">
            <label htmlFor={searchFieldId} className="sr-only">
              Поиск по названию
            </label>
            <Input
              id={searchFieldId}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Название набора"
              autoComplete="off"
              className="w-full min-w-0 sm:w-40"
            />
          </div>
          <DoctorCatalogTitleSortSelect value={titleSort} onValueChange={setTitleSort} />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <p className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
            {displayList.length === 0 ? "Нет наборов" : `Наборов: ${displayList.length}`}
          </p>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "box-border h-[32px] min-h-[32px] inline-flex shrink-0 gap-1 px-3 py-1 text-sm leading-5",
            )}
            onClick={() => {
              setCreating(true);
              setSelectedId(null);
              setMobileSheet(null);
            }}
          >
            Создать набор
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <DoctorCatalogPageLayout toolbar={toolbar}>
      <CatalogSplitLayout
        className="lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-3.25rem-1rem)] lg:overflow-hidden"
        left={
          <CatalogLeftPane stickySplit={false} stickyToolbarRows={1} className="h-full">
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
