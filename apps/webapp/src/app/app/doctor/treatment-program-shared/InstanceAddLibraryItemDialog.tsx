"use client";

import { Activity, BookOpen, ClipboardList, ImageIcon, Layers, MessageSquare, Plus } from "lucide-react";
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
import type { TreatmentProgramLibraryPickType } from "@/modules/treatment-program/types";
import { TreatmentProgramLibraryPickerToolbar } from "./TreatmentProgramLibraryPickerToolbar";
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
    "flex size-[70px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40";
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
        className="size-[70px] shrink-0 rounded-md border border-border/60 object-cover"
      />
    );
  }
  return (
    <div className={shell} aria-hidden>
      {icon}
    </div>
  );
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
  const { addItemCreate } = useInstanceEditorDraft();
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

  const { filteredRows: pickerList, emptyMessage, applyRegionLoadFilters } = useTreatmentProgramLibraryPickerList({
    rows: pickerBaseList,
    searchQuery: itemSearch,
    regionCode: selectedRegionCode,
    loadType: selectedLoadType,
    pickType: resolvedItemType,
  });

  function submitPick(row: TreatmentProgramLibraryRow) {
    if (!spec || editLocked) return;
    if (spec.context === "custom_group") {
      if (!spec.customGroupId?.trim()) {
        setError("Не задана группа");
        return;
      }
    }
    setError(null);

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
        })),
      });
      handleOpenChange(false);
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
        })),
      });
      handleOpenChange(false);
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
    handleOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
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
            <button
              type="button"
              role="radio"
              aria-checked={phaseZeroSource === "catalog"}
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
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={phaseZeroSource === "freeform"}
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
            </button>
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
          <div className="flex flex-col gap-3">
          {showCustomKindToggle ? (
            <div className="flex flex-col gap-2">
              <Label>Тип элемента</Label>
              <div
                className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input p-px"
                role="radiogroup"
                aria-label="Тип элемента"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={customKind === "exercise"}
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
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={customKind === "lfk_complex"}
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
                </button>
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
                <button
                  type="button"
                  role="radio"
                  aria-checked={testsAddMode === "expand_set"}
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
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={testsAddMode === "single_test"}
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
                </button>
              </div>
            </div>
          ) : null}
          <TreatmentProgramLibraryPickerToolbar
            idPrefix="inst-lib"
            searchQuery={itemSearch}
            onSearchQueryChange={setItemSearch}
            regionCode={selectedRegionCode}
            onRegionCodeChange={setSelectedRegionCode}
            loadType={selectedLoadType}
            onLoadTypeChange={setSelectedLoadType}
            showRegionLoadFilters={applyRegionLoadFilters}
            disabled={false}
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
            {pickerList.length === 0 ? (
              <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </li>
            ) : (
              pickerList.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={editLocked}
                    onClick={() => submitPick(row)}
                    className="flex w-full items-start gap-3 rounded-md border border-border/50 bg-card/20 px-2 py-2 text-left text-sm shadow-sm transition-colors hover:border-border hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <LibraryMediaThumb
                      src={row.thumbUrl}
                      itemType={
                        spec?.context === "stage_system_tests" && testsAddMode === "expand_set"
                          ? "clinical_test"
                          : resolvedItemType
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">{row.title}</span>
                      {row.subtitle?.trim() ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                          {row.subtitle.trim()}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
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
