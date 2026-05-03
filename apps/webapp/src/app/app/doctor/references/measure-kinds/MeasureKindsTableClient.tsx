"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctorWorkspaceLayout";
import { MEASURE_KINDS_CATALOG_CHANGED_EVENT } from "@/modules/tests/measureKindsClientEvent";

type Row = { id: string; code: string; label: string; sortOrder: number };

function DragHandle({ listeners, attributes }: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) {
  return (
    <button
      type="button"
      aria-label="Перетащить"
      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded border border-border text-muted-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <span className="flex flex-col gap-0.5" aria-hidden>
        <span className="h-0.5 w-4 rounded-full bg-current" />
        <span className="h-0.5 w-4 rounded-full bg-current" />
        <span className="h-0.5 w-4 rounded-full bg-current" />
      </span>
    </button>
  );
}

function SortableRow({
  row,
  index,
  onLabelChange,
}: {
  row: Row;
  index: number;
  onLabelChange: (id: string, label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border align-middle">
      <td className="px-2 py-2 text-center text-sm text-muted-foreground">{index + 1}</td>
      <td className="px-2 py-2">
        <DragHandle listeners={listeners as never} attributes={attributes as never} />
      </td>
      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{row.code}</td>
      <td className="px-2 py-2">
        <Input value={row.label} onChange={(e) => onLabelChange(row.id, e.target.value)} aria-label="Подпись вида измерения" />
      </td>
    </tr>
  );
}

type Props = {
  initialItems: Row[];
};

export function MeasureKindsTableClient({ initialItems }: Props) {
  const router = useRouter();
  const normalized = useMemo(
    () => [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ru")),
    [initialItems],
  );
  const [rows, setRows] = useState<Row[]>(normalized);
  const [isPending, startTransition] = useTransition();
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    setRows(normalized);
  }, [normalized]);

  const initialJson = useMemo(() => JSON.stringify(normalized), [normalized]);
  const isDirty = JSON.stringify(rows) !== initialJson;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const moved = arrayMove(prev, oldIndex, newIndex);
      return moved.map((r, i) => ({ ...r, sortOrder: i }));
    });
  };

  const onLabelChange = (id: string, label: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  };

  const fail = (msg: string) => {
    setErrorText(msg);
    setErrorOpen(true);
  };

  const onSave = () => {
    if (rows.some((r) => !r.label.trim())) {
      fail("Подпись не может быть пустой (проверьте все строки).");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/doctor/measure-kinds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: rows.map((r, i) => ({
              id: r.id,
              label: r.label.trim(),
              sortOrder: i,
            })),
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          fail(data.error ?? "Не удалось сохранить");
          return;
        }
        window.dispatchEvent(new CustomEvent(MEASURE_KINDS_CATALOG_CHANGED_EVENT));
        router.refresh();
      } catch {
        fail("Ошибка соединения с сервером");
      }
    });
  };

  const onAdd = () => {
    const t = newLabel.trim();
    if (!t) {
      fail("Введите подпись нового вида измерения.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/doctor/measure-kinds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: t }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          fail(data.error ?? "Не удалось создать");
          return;
        }
        setNewLabel("");
        window.dispatchEvent(new CustomEvent(MEASURE_KINDS_CATALOG_CHANGED_EVENT));
        router.refresh();
      } catch {
        fail("Ошибка соединения с сервером");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ошибка</DialogTitle>
            <DialogDescription>{errorText}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button type="button" onClick={() => setErrorOpen(false)}>
              ОК
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className={cn(
          DOCTOR_CATALOG_STICKY_BAR_CLASS,
          "flex flex-col gap-3 bg-card pb-3 pt-1 supports-backdrop-filter:bg-card/90",
          DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
        )}
      >
        <h1 className="text-lg font-semibold">Виды измерений (клинические тесты)</h1>
        <p className="text-sm text-muted-foreground">
          Системный справочник для строк измерений в форме теста. Код генерируется при создании и не меняется; здесь
          можно править подписи и порядок в списке.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onSave} disabled={isPending || !isDirty}>
            Сохранить порядок и подписи
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет записей. Добавьте первый вид ниже или из формы клинического теста.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="w-14 px-2 py-2">#</th>
                    <th className="w-14 px-2 py-2" />
                    <th className="w-48 px-2 py-2">Код</th>
                    <th className="px-2 py-2">Подпись</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <SortableRow key={row.id} row={row} index={idx} onLabelChange={onLabelChange} />
                  ))}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-end">
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="text-xs text-muted-foreground">Новый вид (как в форме теста)</span>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Например: Сила кисти" disabled={isPending} />
        </div>
        <Button type="button" variant="secondary" onClick={onAdd} disabled={isPending}>
          Добавить
        </Button>
      </div>
    </div>
  );
}
