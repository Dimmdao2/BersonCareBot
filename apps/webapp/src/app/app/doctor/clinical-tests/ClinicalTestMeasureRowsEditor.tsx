"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreatableComboboxInput, type CreatableComboboxItem } from "@/shared/ui/CreatableComboboxInput";

export type ClinicalTestMeasureRowModel = {
  id: string;
  measureKind: string;
  value: string;
  unit: string;
  comment: string;
};

function SortableMeasureRow({
  row,
  kindItems,
  onCreate,
  disabled,
  setRows,
}: {
  row: ClinicalTestMeasureRowModel;
  kindItems: CreatableComboboxItem[];
  onCreate: (label: string) => Promise<CreatableComboboxItem>;
  disabled: boolean;
  setRows: React.Dispatch<React.SetStateAction<ClinicalTestMeasureRowModel[]>>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const patch = useCallback(
    (p: Partial<ClinicalTestMeasureRowModel>) => {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...p } : r)));
    },
    [row.id, setRows],
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="space-y-2 rounded-md border border-border/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Переместить строку"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
        >
          Удалить
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2 flex flex-col gap-1">
          <Label className="text-xs">Вид измерения</Label>
          <CreatableComboboxInput
            items={kindItems}
            value={row.measureKind || null}
            onChange={(v) => patch({ measureKind: v ?? "" })}
            onCreate={onCreate}
            disabled={disabled}
            placeholder="Выберите или создайте…"
            aria-label="Вид измерения"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Значение</Label>
          <Input
            value={row.value}
            onChange={(e) => patch({ value: e.target.value })}
            disabled={disabled}
            placeholder="опционально"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Единица</Label>
          <Input
            value={row.unit}
            onChange={(e) => patch({ unit: e.target.value })}
            disabled={disabled}
            placeholder="опционально"
          />
        </div>
        <div className="sm:col-span-2 flex flex-col gap-1">
          <Label className="text-xs">Комментарий</Label>
          <Input
            value={row.comment}
            onChange={(e) => patch({ comment: e.target.value })}
            disabled={disabled}
            placeholder="опционально"
          />
        </div>
      </div>
    </li>
  );
}

export function ClinicalTestMeasureRowsEditor({
  disabled,
  rows,
  setRows,
}: {
  disabled: boolean;
  rows: ClinicalTestMeasureRowModel[];
  setRows: React.Dispatch<React.SetStateAction<ClinicalTestMeasureRowModel[]>>;
}) {
  const [kindItems, setKindItems] = useState<CreatableComboboxItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const run = async () => {
      try {
        const res = await fetch("/api/doctor/measure-kinds");
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new Error("Некорректный ответ сервера");
        }
        const d = data as { ok?: boolean; error?: string; items?: { code: string; label: string }[] };
        if (!res.ok) {
          throw new Error(d.error ?? `Ошибка загрузки (${res.status})`);
        }
        if (!d.ok || !Array.isArray(d.items)) {
          throw new Error(d.error ?? "Справочник видов измерений недоступен");
        }
        if (cancelled) return;
        setKindItems(
          d.items
            .map((it) => ({ value: it.code, label: it.label }))
            .sort((a, b) => a.label.localeCompare(b.label, "ru")),
        );
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Не удалось загрузить виды измерений";
        setLoadError(msg);
        setKindItems([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const onCreate = useCallback(async (label: string) => {
    const res = await fetch("/api/doctor/measure-kinds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = (await res.json()) as { ok?: boolean; item?: { code: string; label: string }; error?: string };
    if (!res.ok || !data.ok || !data.item) {
      throw new Error(data.error ?? "Ошибка создания вида измерения");
    }
    const next: CreatableComboboxItem = { value: data.item.code, label: data.item.label };
    setKindItems((prev) => {
      const exists = prev.some((p) => p.value === next.value);
      return exists ? prev : [...prev, next].sort((a, b) => a.label.localeCompare(b.label, "ru"));
    });
    return next;
  }, []);

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), measureKind: "", value: "", unit: "", comment: "" },
    ]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Измерения</Label>
        <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={disabled}>
          + Строка
        </Button>
      </div>
      {loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <span className="min-w-0">{loadError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/50"
            onClick={() => setReloadToken((n) => n + 1)}
          >
            Повторить
          </Button>
        </div>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {rows.map((row) => (
              <SortableMeasureRow
                key={row.id}
                row={row}
                kindItems={kindItems}
                onCreate={onCreate}
                disabled={disabled}
                setRows={setRows}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
