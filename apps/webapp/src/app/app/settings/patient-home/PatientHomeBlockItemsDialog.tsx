"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PatientHomeBlockItem } from "@/modules/patient-home/ports";
import {
  deletePatientHomeItem,
  reorderPatientHomeItems,
  updatePatientHomeItemVisibility,
} from "./actions";

function SortableItemRow({
  item,
  onToggleVisible,
  onDelete,
}: {
  item: PatientHomeBlockItem;
  onToggleVisible(itemId: string, next: boolean): void;
  onDelete(itemId: string): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-lg border border-border p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label="Переместить"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.titleOverride ?? item.targetRef}</div>
        <div className="text-xs text-muted-foreground">{item.targetType}: {item.targetRef}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onToggleVisible(item.id, !item.isVisible)}
        aria-label={item.isVisible ? "Скрыть" : "Показать"}
      >
        {item.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label="Удалить">
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

export function PatientHomeBlockItemsDialog({
  open,
  onOpenChange,
  blockCode,
  initialItems,
  onSaved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  blockCode: string;
  initialItems: PatientHomeBlockItem[];
  onSaved(): void;
}) {
  const [items, setItems] = useState<PatientHomeBlockItem[]>(
    () => [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((item) => item.id), [items]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const reorderedIds = items.map((item) => item.id);
      const reorderRes = await reorderPatientHomeItems(blockCode, reorderedIds);
      if (!reorderRes.ok) {
        setError(reorderRes.error);
        return;
      }
      for (const item of items) {
        const source = initialItems.find((x) => x.id === item.id);
        if (source && source.isVisible !== item.isVisible) {
          const visRes = await updatePatientHomeItemVisibility(item.id, item.isVisible);
          if (!visRes.ok) {
            setError(visRes.error);
            return;
          }
        }
      }
      for (const itemId of removedIds) {
        const delRes = await deletePatientHomeItem(itemId);
        if (!delRes.ok) {
          setError(delRes.error);
          return;
        }
      }
      onSaved();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Изменить элементы блока</DialogTitle>
          <DialogDescription>Перетащите элементы, измените видимость или удалите лишние.</DialogDescription>
        </DialogHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  onToggleVisible={(itemId, next) =>
                    setItems((prev) => prev.map((row) => (row.id === itemId ? { ...row, isVisible: next } : row)))
                  }
                  onDelete={(itemId) => {
                    setRemovedIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
                    setItems((prev) => prev.filter((row) => row.id !== itemId));
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Отменить</DialogClose>
          <Button onClick={handleSave} disabled={isPending}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
