"use client";

import { Activity, BookOpen, Check, ClipboardList, ImageIcon, Layers, MessageSquare, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { cn } from "@/lib/utils";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { Card, CardContent } from "@/shared/ui/doctor/primitives/card";
import type { TreatmentProgramLibraryPickType } from "@/modules/treatment-program/types";
import type { TreatmentProgramInstanceStageItemView } from "@/modules/treatment-program/types";
import {
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { DoctorCatalogFiltersForm } from "@/shared/ui/doctor/DoctorCatalogFiltersForm";
import { CatalogLeftPane } from "@/shared/ui/doctor/catalog/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/doctor/catalog/CatalogRightPane";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { VirtualizedItemGrid } from "@/shared/ui/doctor/catalog/VirtualizedItemGrid";
import { doctorInteractiveSurfaceButtonClass } from "@/shared/ui/doctor/doctorVisual";
import type { TreatmentProgramLibraryPickers, TreatmentProgramLibraryRow } from "./treatmentProgramLibraryTypes";
import { useTreatmentProgramLibraryPickerList } from "./useTreatmentProgramLibraryPickerList";
import { useInstanceEditorDraft } from "./InstanceEditorDraftContext";
import {
  freeformRecommendationDraftSnapshot,
  libraryRowToItemDraftSnapshot,
} from "./treatmentProgramLibraryDraftSnapshot";

/** Квадратная кнопка «+» в шапке группы / этапа 0 — как в конструкторе шаблона. */
export function TreatmentProgramAddItemSquareButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="size-7 shrink-0"
      disabled={disabled}
      aria-label="Добавить элемент"
      onClick={onClick}
    >
      <Plus className="size-4" strokeWidth={2} />
    </Button>
  );
}

function LibraryMediaThumb({
  src,
  itemType,
}: {
  src: string | null | undefined;
  itemType: TreatmentProgramLibraryPickType;
}) {
  const shell =
    "flex h-[135px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[calc(var(--radius-md)*0.5)] border border-border/60 bg-muted/40";
  const icon =
    itemType === "recommendation" ? (
      <MessageSquare className="size-7 text-muted-foreground" aria-hidden />
    ) : itemType === "clinical_test" ? (
      <ClipboardList className="size-7 text-muted-foreground" aria-hidden />
    ) : itemType === "lesson" ? (
      <BookOpen className="size-7 text-muted-foreground" aria-hidden />
    ) : itemType === "lfk_complex" ? (
      <Layers className="size-7 text-muted-foreground" aria-hidden />
    ) : itemType === "exercise" ? (
      <Activity className="size-7 text-muted-foreground" aria-hidden />
    ) : (
      <ImageIcon className="size-7 text-muted-foreground" aria-hidden />
    );
  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- превью каталога врача
      <img
        src={src.trim()}
        alt=""
        className="h-[135px] w-full shrink-0 rounded-[calc(var(--radius-md)*0.5)] border border-border/60 object-cover"
      />
    );
  }
  return (
    <div className={shell} aria-hidden>
      {icon}
    </div>
  );
}

function sameContainerGroupId(
  item: Pick<TreatmentProgramInstanceStageItemView, "groupId">,
  groupId: string | null,
): boolean {
  return (item.groupId ?? null) === groupId;
}

function firstCurrentGroupLibraryItem(
  items: TreatmentProgramInstanceStageItemView[],
  input: {
    itemType: TreatmentProgramLibraryPickType;
    itemRefId: string;
    groupId: string | null;
  },
): TreatmentProgramInstanceStageItemView | null {
  return (
    items.find(
      (item) =>
        item.itemType === input.itemType &&
        item.itemRefId === input.itemRefId &&
        sameContainerGroupId(item, input.groupId),
    ) ?? null
  );
}

function currentGroupExpandedItemIds(
  items: TreatmentProgramInstanceStageItemView[],
  input: {
    itemType: "exercise" | "clinical_test";
    itemRefIds: readonly string[];
    groupId: string | null;
  },
): string[] {
  if (input.itemRefIds.length === 0) return [];
  const remaining = [...input.itemRefIds];
  const out: string[] = [];
  for (const item of items) {
    if (item.itemType !== input.itemType || !sameContainerGroupId(item, input.groupId)) continue;
    const idx = remaining.indexOf(item.itemRefId);
    if (idx === -1) continue;
    out.push(item.id);
    remaining.splice(idx, 1);
    if (remaining.length === 0) break;
  }
  return out;
}

export type InstanceAddLibraryItemContext =
  | "phase_zero_recommendations"
  | "stage_system_recommendations"
  | "stage_system_tests"
  | "custom_group";

export type InstanceAddLibraryItemSpec = {
  stageId: string;
  context: InstanceAddLibraryItemContext;
  /** Для `custom_group` — id пользовательской группы этапа. */
  customGroupId: string | null;
};

export function InstanceAddLibraryItemDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: InstanceAddLibraryItemSpec | null;
  library: TreatmentProgramLibraryPickers;
  editLocked: boolean;
}) {
  const { open, onOpenChange, spec, library, editLocked } = props;
  const { addItemCreate, deleteItem, displayDetail } = useInstanceEditorDraft();
  const [itemSearch, setItemSearch] = useState("");
  const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(null);
  const [selectedLoadType, setSelectedLoadType] = useState<string | null>(null);
  const [customKind, setCustomKind] = useState<"exercise" | "lfk_complex">("exercise");
  const [testsAddMode, setTestsAddMode] = useState<"expand_set" | "single_test">("expand_set");
  const [error, setError] = useState<string | null>(null);
  const [phaseZeroSource, setPhaseZeroSource] = useState<"catalog" | "freeform">("catalog");
  const [freeformTitle, setFreeformTitle] = useState("");
  const [freeformBody, setFreeformBody] = useState("");

  const resetDialogForm = useCallback(() => {
    setItemSearch("");
    setSelectedRegionCode(null);
    setSelectedLoadType(null);
    setCustomKind("exercise");
    setTestsAddMode("expand_set");
    setError(null);
    setPhaseZeroSource("catalog");
    setFreeformTitle("");
    setFreeformBody("");
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetDialogForm();
      onOpenChange(next);
    },
    [onOpenChange, resetDialogForm],
  );

  const resolvedItemType: TreatmentProgramLibraryPickType = useMemo(() => {
    if (!spec) return "exercise";
    switch (spec.context) {
      case "phase_zero_recommendations":
      case "stage_system_recommendations":
        return "recommendation";
      case "stage_system_tests":
        return "clinical_test";
      case "custom_group":
        return customKind;
      default:
        return "exercise";
    }
  }, [spec, customKind]);

  const pickerBaseList = useMemo((): TreatmentProgramLibraryRow[] => {
    if (spec?.context === "stage_system_tests") {
      return testsAddMode === "expand_set" ? library.testSets : library.clinicalTests;
    }
    switch (resolvedItemType) {
      case "exercise":
        return library.exercises;
      case "lfk_complex":
        return library.lfkComplexes;
      case "clinical_test":
        return library.clinicalTests;
      case "recommendation":
        return library.recommendations;
      default:
        return [];
    }
  }, [library, resolvedItemType, spec?.context, testsAddMode]);

  const currentStageItems = useMemo(() => {
    if (!spec) return [];
    return displayDetail.stages.find((stage) => stage.id === spec.stageId)?.items ?? [];
  }, [displayDetail.stages, spec]);

  const targetGroupId = spec?.context === "custom_group" ? (spec.customGroupId ?? null) : null;

  const { filteredRows: pickerList, emptyMessage } = useTreatmentProgramLibraryPickerList({
    rows: pickerBaseList,
    searchQuery: itemSearch,
    regionCode: selectedRegionCode,
    loadType: selectedLoadType,
    pickType: resolvedItemType,
  });

  function selectedItemIdsForRow(row: TreatmentProgramLibraryRow): string[] {
    if (!spec) return [];
    if (spec.context === "stage_system_tests" && testsAddMode === "expand_set") {
      const refs = (row.expandLines ?? []).map((line) => line.itemRefId);
      const ids = currentGroupExpandedItemIds(currentStageItems, {
        itemType: "clinical_test",
        itemRefIds: refs,
        groupId: targetGroupId,
      });
      return refs.length > 0 && ids.length === refs.length ? ids : [];
    }
    if (resolvedItemType === "lfk_complex") {
      const refs = (row.expandLines ?? []).map((line) => line.itemRefId);
      const ids = currentGroupExpandedItemIds(currentStageItems, {
        itemType: "exercise",
        itemRefIds: refs,
        groupId: targetGroupId,
      });
      return refs.length > 0 && ids.length === refs.length ? ids : [];
    }
    const item = firstCurrentGroupLibraryItem(currentStageItems, {
      itemType: resolvedItemType,
      itemRefId: row.id,
      groupId: targetGroupId,
    });
    return item ? [item.id] : [];
  }

  function togglePick(row: TreatmentProgramLibraryRow) {
    if (!spec || editLocked) return;
    if (spec.context === "custom_group") {
      if (!spec.customGroupId?.trim()) {
        setError("Не задана группа");
        return;
      }
    }
    setError(null);

    const selectedItemIds = selectedItemIdsForRow(row);
    if (selectedItemIds.length > 0) {
      for (const itemId of selectedItemIds) deleteItem(itemId);
      return;
    }

    if (spec.context === "stage_system_tests" && testsAddMode === "expand_set") {
      const lines = row.expandLines ?? [];
      if (lines.length === 0) {
        setError("Набор пуст или нет данных для добавления");
        return;
      }
      addItemCreate({
        kind: "test_set_expand",
        stageId: spec.stageId,
        testSetId: row.id,
        items: lines.map((line) => ({
          itemRefId: line.itemRefId,
          snapshot: line.snapshot,
          ...(line.loadSettings ? { loadSettings: line.loadSettings } : {}),
        })),
      });
      return;
    }

    if (resolvedItemType === "lfk_complex") {
      if (!spec.customGroupId?.trim()) {
        setError("Не задана группа");
        return;
      }
      const lines = row.expandLines ?? [];
      if (lines.length === 0) {
        setError("Комплекс пуст или нет данных для разворота");
        return;
      }
      addItemCreate({
        kind: "lfk_complex_expand",
        stageId: spec.stageId,
        groupId: spec.customGroupId,
        complexTemplateId: row.id,
        items: lines.map((line) => ({
          itemRefId: line.itemRefId,
          snapshot: line.snapshot,
          ...(line.loadSettings ? { loadSettings: line.loadSettings } : {}),
        })),
      });
      return;
    }

    const groupId =
      spec.context === "custom_group" && spec.customGroupId ? spec.customGroupId : undefined;

    addItemCreate({
      kind: "library_item",
      stageId: spec.stageId,
      itemType: resolvedItemType,
      itemRefId: row.id,
      groupId,
      snapshot: libraryRowToItemDraftSnapshot(row, resolvedItemType),
    });
  }

  function submitFreeform() {
    if (!spec || editLocked) return;
    if (spec.context !== "phase_zero_recommendations") return;
    const title = freeformTitle.trim();
    if (!title) {
      setError("Укажите заголовок");
      return;
    }
    setError(null);
    const bodyMd = freeformBody.trim();
    addItemCreate({
      kind: "freeform_recommendation",
      stageId: spec.stageId,
      title,
      bodyMd,
      snapshot: freeformRecommendationDraftSnapshot(title, bodyMd),
    });
    handleOpenChange(false);
  }

  const showCustomKindToggle = spec?.context === "custom_group";
  const isPhaseZero = spec?.context === "phase_zero_recommendations";
  const targetLabel =
    spec?.context === "custom_group"
      ? "Текущая группа этапа"
      : spec?.context === "stage_system_tests"
        ? "Блок тестов этапа"
        : isPhaseZero
          ? "Общие рекомендации"
          : "Системная группа этапа";
  const selectedRowsCount = pickerBaseList.filter((row) => selectedItemIdsForRow(row).length > 0).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden sm:h-[min(760px,calc(100dvh-2rem))] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{isPhaseZero ? "Рекомендация" : "Элемент из библиотеки"}</DialogTitle>
          {!isPhaseZero ? (
            <DialogDescription>
              Выберите позицию каталога для добавления в программу пациента.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {isPhaseZero ? (
          <div
            className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input p-px"
            role="radiogroup"
            aria-label="Способ добавления"
          >
            <Button
              type="button"
              role="radio"
              aria-checked={phaseZeroSource === "catalog"}
              variant="ghost"
              className={cn(
                "text-xs font-medium transition-colors",
                phaseZeroSource === "catalog"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-foreground hover:bg-muted/60",
              )}
              onClick={() => {
                setPhaseZeroSource("catalog");
                setError(null);
              }}
            >
              Каталог
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={phaseZeroSource === "freeform"}
              variant="ghost"
              className={cn(
                "text-xs font-medium transition-colors",
                phaseZeroSource === "freeform"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-foreground hover:bg-muted/60",
              )}
              onClick={() => {
                setPhaseZeroSource("freeform");
                setFreeformTitle("");
                setFreeformBody("");
                setError(null);
              }}
            >
              Свой текст
            </Button>
          </div>
        ) : null}
        {isPhaseZero && phaseZeroSource === "freeform" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tp-freeform-title">Заголовок</Label>
              <Input
                id="tp-freeform-title"
                className="text-sm"
                value={freeformTitle}
                onChange={(e) => setFreeformTitle(e.target.value)}
                disabled={editLocked}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tp-freeform-body">Текст</Label>
              <Textarea
                id="tp-freeform-body"
                className="min-h-[200px] resize-y text-sm"
                value={freeformBody}
                onChange={(e) => setFreeformBody(e.target.value)}
                disabled={editLocked}
                maxLength={100_000}
                spellCheck
              />
            </div>
            <Button type="button" disabled={editLocked} onClick={submitFreeform}>
              Добавить
            </Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {showCustomKindToggle ? (
            <div className="flex flex-col gap-2">
              <Label>Тип элемента</Label>
              <div
                className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input p-px"
                role="radiogroup"
                aria-label="Тип элемента"
              >
                <Button
                  type="button"
                  role="radio"
                  aria-checked={customKind === "exercise"}
                  variant="ghost"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    customKind === "exercise"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => {
                    setCustomKind("exercise");
                    setItemSearch("");
                    setSelectedRegionCode(null);
                    setSelectedLoadType(null);
                  }}
                >
                  Упражнение ЛФК
                </Button>
                <Button
                  type="button"
                  role="radio"
                  aria-checked={customKind === "lfk_complex"}
                  variant="ghost"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    customKind === "lfk_complex"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => {
                    setCustomKind("lfk_complex");
                    setItemSearch("");
                    setSelectedRegionCode(null);
                    setSelectedLoadType(null);
                  }}
                >
                  Комплекс ЛФК
                </Button>
              </div>
            </div>
          ) : null}
          {spec?.context === "stage_system_tests" ? (
            <div className="flex flex-col gap-2">
              <Label>Добавить</Label>
              <div
                className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input p-px"
                role="radiogroup"
                aria-label="Режим добавления тестов"
              >
                <Button
                  type="button"
                  role="radio"
                  aria-checked={testsAddMode === "expand_set"}
                  variant="ghost"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    testsAddMode === "expand_set"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => {
                    setTestsAddMode("expand_set");
                    setItemSearch("");
                  }}
                >
                  Набор тестов
                </Button>
                <Button
                  type="button"
                  role="radio"
                  aria-checked={testsAddMode === "single_test"}
                  variant="ghost"
                  className={cn(
                    "text-xs font-medium transition-colors",
                    testsAddMode === "single_test"
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => {
                    setTestsAddMode("single_test");
                    setItemSearch("");
                  }}
                >
                  Один тест
                </Button>
              </div>
            </div>
          ) : null}
          <DoctorCatalogFiltersToolbar
            className="static rounded-lg border border-border/60 bg-card shadow-none"
            filters={
              <DoctorCatalogToolbarFiltersSlot>
                <DoctorCatalogFiltersForm
                  idPrefix="inst-lib"
                  q={itemSearch}
                  regionCode={selectedRegionCode ?? undefined}
                  loadType={selectedLoadType ?? undefined}
                  onFiltersChange={({ q, regionCode, loadType }) => {
                    setItemSearch(q);
                    setSelectedRegionCode(regionCode);
                    setSelectedLoadType(loadType);
                  }}
                />
              </DoctorCatalogToolbarFiltersSlot>
            }
          />
          <CatalogSplitLayout
            className="min-h-0 flex-1 lg:min-h-0"
            mobileView="list"
            desktopColsClassName="lg:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]"
            left={
              <CatalogLeftPane
                stickySplit={false}
                className="h-full"
                headerSlot={
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs text-muted-foreground">
                    <span>{pickerList.length === 0 ? "Нет позиций" : `Позиций: ${pickerList.length}`}</span>
                    <span className="truncate">В группу: {targetLabel}</span>
                  </div>
                }
              >
                {pickerList.length === 0 ? (
                  <p className="m-0 flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </p>
                ) : (
                  <VirtualizedItemGrid
                    items={pickerList}
                    columns={2}
                    estimatedRowHeight={206}
                    overscan={2}
                    keyExtractor={(row) => row.id}
                    containerClassName="h-full min-h-0"
                    gridClassName="pb-2"
                    renderItem={(row) => {
                      const selected = selectedItemIdsForRow(row).length > 0;
                      return (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={editLocked}
                          aria-pressed={selected}
                          onClick={() => togglePick(row)}
                          className={cn(
                            doctorInteractiveSurfaceButtonClass,
                            "h-full w-full rounded-[calc(var(--radius-xl)*0.5)] p-0 text-left disabled:pointer-events-none disabled:opacity-50",
                          )}
                        >
                          <Card
                            size="sm"
                            className={cn(
                              "relative h-full w-full min-w-0 rounded-[calc(var(--radius-xl)*0.5)] transition-shadow data-[size=sm]:py-1.5",
                              selected && "ring-1 ring-primary/60 ring-offset-1 ring-offset-background",
                            )}
                          >
                            <CardContent className="flex h-full flex-col gap-2 py-px group-data-[size=sm]/card:px-1.5">
                              <LibraryMediaThumb
                                src={row.thumbUrl}
                                itemType={
                                  spec?.context === "stage_system_tests" && testsAddMode === "expand_set"
                                    ? "clinical_test"
                                    : resolvedItemType
                                }
                              />
                              <span className="min-w-0 text-center">
                                <span className="block line-clamp-2 text-xs font-medium leading-snug">{row.title}</span>
                                {row.subtitle?.trim() ? (
                                  <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                                    {row.subtitle.trim()}
                                  </span>
                                ) : null}
                              </span>
                              {selected ? (
                                <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Check className="size-3.5" aria-hidden />
                                </span>
                              ) : null}
                            </CardContent>
                          </Card>
                        </Button>
                      );
                    }}
                  />
                )}
              </CatalogLeftPane>
            }
            right={
              <CatalogRightPane className="h-full" contentClassName="p-4">
                <div className="flex h-full flex-col gap-3">
                  <div>
                    <p className="text-sm font-medium">Добавление в программу</p>
                    <p className="mt-1 text-sm text-muted-foreground">Цель: {targetLabel}.</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                    В этой группе выбрано: {selectedRowsCount}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Нажмите карточку, чтобы добавить позицию; повторный клик убирает её только из текущей группы.
                  </p>
                </div>
              </CatalogRightPane>
            }
          />
        </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
