"use client";

import { BookOpen, ClipboardList, ImageIcon, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  TreatmentProgramInstanceStatus,
  TreatmentProgramItemType,
} from "@/modules/treatment-program/types";
import { runIfProgramInstanceMutationAllowed } from "./programInstanceMutationGuard";
import type { TreatmentProgramLibraryPickers, TreatmentProgramLibraryRow } from "./treatmentProgramLibraryTypes";

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
  itemType: TreatmentProgramItemType;
}) {
  const icon =
    itemType === "lesson" ? (
      <BookOpen className="size-5 text-muted-foreground" aria-hidden />
    ) : itemType === "test_set" ? (
      <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
    ) : (
      <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
    );
  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- превью каталога врача
      <img src={src.trim()} alt="" className="size-12 shrink-0 rounded-md border border-border/60 object-cover" />
    );
  }
  return (
    <div
      className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40"
      aria-hidden
    >
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
  instanceId: string;
  spec: InstanceAddLibraryItemSpec | null;
  library: TreatmentProgramLibraryPickers;
  programStatus: TreatmentProgramInstanceStatus;
  editLocked: boolean;
  onAdded: () => Promise<void>;
}) {
  const { open, onOpenChange, instanceId, spec, library, programStatus, editLocked, onAdded } = props;
  const [itemSearch, setItemSearch] = useState("");
  const [customKind, setCustomKind] = useState<"exercise" | "lfk_complex">("exercise");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setItemSearch("");
      setCustomKind("exercise");
      setError(null);
    }
  }, [open]);

  const resolvedItemType: TreatmentProgramItemType = useMemo(() => {
    if (!spec) return "exercise";
    switch (spec.context) {
      case "phase_zero_recommendations":
      case "stage_system_recommendations":
        return "recommendation";
      case "stage_system_tests":
        return "test_set";
      case "custom_group":
        return customKind;
      default:
        return "exercise";
    }
  }, [spec, customKind]);

  const pickerList = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const filter = <T extends { title: string }>(rows: T[]) =>
      q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
    switch (resolvedItemType) {
      case "exercise":
        return filter(library.exercises);
      case "lfk_complex":
        return filter(library.lfkComplexes);
      case "test_set":
        return filter(library.testSets);
      case "recommendation":
        return filter(library.recommendations);
      default:
        return [];
    }
  }, [itemSearch, resolvedItemType, library]);

  async function submitPick(row: TreatmentProgramLibraryRow) {
    if (!spec || editLocked || busy) return;
    if (spec.context === "custom_group") {
      if (!spec.customGroupId?.trim()) {
        setError("Не задана группа");
        return;
      }
    }
    setError(null);
    await runIfProgramInstanceMutationAllowed(programStatus, async () => {
      setBusy(true);
      try {
        const body: Record<string, unknown> = {
          itemType: resolvedItemType,
          itemRefId: row.id,
        };
        if (spec.context === "custom_group" && spec.customGroupId) {
          body.groupId = spec.customGroupId;
        }
        const res = await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/stages/${encodeURIComponent(spec.stageId)}/items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Не удалось добавить элемент");
          return;
        }
        onOpenChange(false);
        await onAdded();
      } finally {
        setBusy(false);
      }
    });
  }

  const showCustomKindToggle = spec?.context === "custom_group";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Элемент из библиотеки</DialogTitle>
          <DialogDescription>Выберите позицию каталога для добавления в программу пациента.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
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
                  }}
                >
                  Комплекс ЛФК
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="inst-lib-search">Поиск</Label>
            <Input
              id="inst-lib-search"
              className="text-sm"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Фильтр по названию"
              disabled={busy}
            />
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
            {pickerList.length === 0 ? (
              <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Нет записей для выбранного типа.
              </li>
            ) : (
              pickerList.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={editLocked || busy}
                    onClick={() => void submitPick(row)}
                    className="flex w-full items-start gap-3 rounded-md border border-border/50 bg-card/20 px-2 py-2 text-left text-sm shadow-sm transition-colors hover:border-border hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <LibraryMediaThumb src={row.thumbUrl} itemType={resolvedItemType} />
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
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
