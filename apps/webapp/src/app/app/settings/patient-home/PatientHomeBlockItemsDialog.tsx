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
import { PATIENT_HOME_USEFUL_POST_BADGE_LABEL } from "@/modules/patient-home/usefulPostPresentation";
import {
  deletePatientHomeItem,
  reorderPatientHomeItems,
  updatePatientHomeItemPresentation,
  updatePatientHomeItemVisibility,
} from "./actions";

function normalizeUsefulPostBadge(label: string | null | undefined): string | null {
  const t = label?.trim();
  return t === PATIENT_HOME_USEFUL_POST_BADGE_LABEL ? PATIENT_HOME_USEFUL_POST_BADGE_LABEL : null;
}

function SortableItemRow({
  blockCode,
  item,
  onToggleVisible,
  onDelete,
  onBadgeChange,
  onShowTitleChange,
}: {
  blockCode: string;
  item: PatientHomeBlockItem;
  onToggleVisible(itemId: string, next: boolean): void;
  onDelete(itemId: string): void;
  onBadgeChange(itemId: string, badgeLabel: string | null): void;
  onShowTitleChange(itemId: string, showTitle: boolean): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const usefulPost = blockCode === "useful_post";
  const badgeOn = normalizeUsefulPostBadge(item.badgeLabel) !== null;
  const usefulPostCustomBadge =
    usefulPost &&
    Boolean(item.badgeLabel?.trim()) &&
    normalizeUsefulPostBadge(item.badgeLabel) === null;
  const usefulPostShowTitle = item.showTitle !== false;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Переместить"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-medium">{item.titleOverride ?? item.targetRef}</div>
            {item.badgeLabel?.trim() ?
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {item.badgeLabel.trim()}
              </span>
            : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {item.targetType}: {item.targetRef}
          </div>
          {usefulPost ?
            <>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={usefulPostShowTitle}
                  onChange={(e) => onShowTitleChange(item.id, e.target.checked)}
                />
                Отображать заголовок текстом
              </label>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={badgeOn}
                  onChange={(e) =>
                    onBadgeChange(item.id, e.target.checked ? PATIENT_HOME_USEFUL_POST_BADGE_LABEL : null)
                  }
                />
                Показывать бейдж «Новый пост»
              </label>
              {usefulPostCustomBadge ?
                <p className="mt-1 text-xs text-muted-foreground">
                  Задан свой текст бейджа. Включите переключатель, чтобы заменить его на «Новый пост» при сохранении.
                </p>
              : null}
            </>
          : null}
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-1 sm:ml-auto">
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
      </div>
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
      if (blockCode === "useful_post") {
        for (const item of items) {
          const source = initialItems.find((x) => x.id === item.id);
          if (!source) continue;
          const prevB = normalizeUsefulPostBadge(source.badgeLabel);
          const nextB = normalizeUsefulPostBadge(item.badgeLabel);
          const prevShowTitle = source.showTitle !== false;
          const nextShowTitle = item.showTitle !== false;
          if (prevB !== nextB || prevShowTitle !== nextShowTitle) {
            const payload: { itemId: string; badgeLabel?: string | null; showTitle?: boolean } = { itemId: item.id };
            if (prevB !== nextB) payload.badgeLabel = nextB;
            if (prevShowTitle !== nextShowTitle) payload.showTitle = nextShowTitle;
            const pres = await updatePatientHomeItemPresentation(payload);
            if (!pres.ok) {
              setError(pres.error);
              return;
            }
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
                  blockCode={blockCode}
                  item={item}
                  onToggleVisible={(itemId, next) =>
                    setItems((prev) => prev.map((row) => (row.id === itemId ? { ...row, isVisible: next } : row)))
                  }
                  onBadgeChange={(itemId, badgeLabel) =>
                    setItems((prev) =>
                      prev.map((row) => (row.id === itemId ? { ...row, badgeLabel } : row)),
                    )
                  }
                  onShowTitleChange={(itemId, showTitle) =>
                    setItems((prev) => prev.map((row) => (row.id === itemId ? { ...row, showTitle } : row)))
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
          <Button onClick={handleSave} disabled={isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
