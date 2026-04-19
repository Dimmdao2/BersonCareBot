"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TestSet } from "@/modules/tests/types";
import { cn } from "@/lib/utils";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import { DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import {
  archiveDoctorTestSetInline,
  saveDoctorTestSetInline,
  saveDoctorTestSetItemsInline,
} from "./actionsInline";
import { TestSetForm } from "./TestSetForm";
import { TestSetItemsForm } from "./TestSetItemsForm";
import { TEST_SETS_PATH } from "./paths";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PickerSearchField } from "@/shared/ui/PickerSearchField";

export type TestSetTitleSort = "default" | "asc" | "desc";

type Props = {
  initialSets: TestSet[];
  initialSelectedId: string | null;
};

function TestSetListToolbar({
  setCount,
  searchQuery,
  onSearchChange,
  titleSort,
  onTitleSortChange,
  onCreate,
}: {
  setCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  titleSort: TestSetTitleSort;
  onTitleSortChange: (next: TestSetTitleSort) => void;
  onCreate: () => void;
}) {
  const searchFieldId = useId();
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 px-2 pb-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {setCount === 0 ? "Нет наборов" : `Наборов: ${setCount}`}
      </p>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full sm:flex-row sm:items-end sm:justify-end">
        <PickerSearchField
          id={searchFieldId}
          label="Поиск по названию"
          placeholder="Название набора"
          value={searchQuery}
          onValueChange={onSearchChange}
          className="min-w-0 sm:max-w-[14rem] sm:flex-initial"
        />
        <div className="flex min-w-[11rem] max-w-full flex-col gap-1 sm:max-w-[14rem] sm:flex-initial">
          <span className="text-[11px] text-muted-foreground sm:sr-only">Сортировка</span>
          <Select value={titleSort} onValueChange={(v) => onTitleSortChange(v as TestSetTitleSort)}>
            <SelectTrigger size="sm" className="h-8 w-full text-left">
              <SelectValue>
                {titleSort === "asc"
                  ? "Название А→Я"
                  : titleSort === "desc"
                    ? "Название Я→А"
                    : "Сортировка"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">По дате изменения</SelectItem>
              <SelectItem value="asc">Название А→Я</SelectItem>
              <SelectItem value="desc">Название Я→А</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" size="sm" className="shrink-0" onClick={onCreate}>
          Создать набор
        </Button>
      </div>
    </div>
  );
}

export function TestSetsPageClient({ initialSets, initialSelectedId }: Props) {
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

  const displayList = useMemo(() => {
    let out = initialSets;
    const needle = normalizeRuSearchString(searchQuery.trim());
    if (needle) {
      out = out.filter((s) => normalizeRuSearchString(s.title).includes(needle));
    }
    if (titleSort === "asc" || titleSort === "desc") {
      out = [...out].sort((a, b) => {
        const cmp = a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return titleSort === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [initialSets, searchQuery, titleSort]);

  useEffect(() => {
    queueMicrotask(() => {
      if (creating) return;
      if (displayList.length === 0) {
        setSelectedId(null);
        setMobileSheet(null);
        return;
      }
      setSelectedId((cur) => {
        if (cur != null && displayList.some((s) => s.id === cur)) return cur;
        return displayList[0]!.id;
      });
      setMobileSheet((prev) => {
        if (prev == null) return prev;
        const next = displayList.find((s) => s.id === prev.id);
        return next ?? null;
      });
    });
  }, [creating, displayList]);

  const selected =
    creating ? null : (displayList.find((s) => s.id === selectedId) ?? (displayList.length > 0 ? displayList[0]! : null));

  const toolbarProps = {
    setCount: displayList.length,
    searchQuery,
    onSearchChange: setSearchQuery,
    titleSort,
    onTitleSortChange: setTitleSort,
    onCreate: () => {
      setCreating(true);
      setSelectedId(null);
      setMobileSheet(null);
    },
  };

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
      <p className="text-sm text-muted-foreground">Выберите набор слева или создайте новый.</p>
    );

  const desktopRight = (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{rightInner}</CardContent>
    </Card>
  );

  const mobileDetailOpen = creating || mobileSheet != null;

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden lg:block">
        <div className={cn("grid items-stretch gap-4 lg:grid-cols-2", DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS)}>
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="shrink-0 p-2 pb-0">
              <TestSetListToolbar {...toolbarProps} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 pt-2">
              {renderRows((s) => setSelectedId(s.id), creating ? null : selected?.id ?? null)}
            </div>
          </aside>
          {desktopRight}
        </div>
      </div>

      <div className="relative min-h-[40vh] overflow-hidden lg:hidden">
        <div
          className={cn(
            "transition-transform duration-300 ease-out",
            mobileDetailOpen ? "-translate-x-full" : "translate-x-0",
          )}
        >
          <aside className="rounded-xl border border-border bg-card p-2">
            <TestSetListToolbar {...toolbarProps} />
            {renderRows((s) => {
              setCreating(false);
              setSelectedId(s.id);
              setMobileSheet(s);
            }, mobileSheet?.id ?? null)}
          </aside>
        </div>

        <div
          className={cn(
            "absolute inset-0 z-10 overflow-y-auto bg-background px-1 pb-6 pt-2 transition-transform duration-300 ease-out",
            mobileDetailOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          {mobileDetailOpen ? (
            <>
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
              <Card className="min-w-0 border-0 shadow-none sm:border sm:shadow-sm">
                <CardContent className="p-2 sm:p-4">
                  {creating ? (
                    <TestSetForm
                      testSet={null}
                      saveAction={saveDoctorTestSetInline}
                      archiveAction={archiveDoctorTestSetInline}
                      backHref={TEST_SETS_PATH}
                    />
                  ) : mobileSheet ? (
                    <>
                      <TestSetForm
                        testSet={mobileSheet}
                        saveAction={saveDoctorTestSetInline}
                        archiveAction={archiveDoctorTestSetInline}
                        backHref={TEST_SETS_PATH}
                      />
                      <section className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4">
                        <h2 className="text-lg font-medium">Состав набора</h2>
                        <TestSetItemsForm testSet={mobileSheet} saveItemsAction={saveDoctorTestSetItemsInline} />
                      </section>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Нет данных.</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
