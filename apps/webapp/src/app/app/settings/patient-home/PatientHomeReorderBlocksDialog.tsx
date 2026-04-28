"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
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
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import { reorderPatientHomeBlocks } from "./actions";

function SortableBlockRow({ block }: { block: PatientHomeBlock }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.code });
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
      <div className="text-sm font-medium">{block.title}</div>
    </li>
  );
}

export function PatientHomeReorderBlocksDialog({
  open,
  onOpenChange,
  initialBlocks,
  onSaved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  initialBlocks: PatientHomeBlock[];
  onSaved(): void;
}) {
  const [blocks, setBlocks] = useState<PatientHomeBlock[]>(
    () => [...initialBlocks].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => blocks.map((block) => block.code), [blocks]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((block) => block.code === active.id);
      const newIndex = prev.findIndex((block) => block.code === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await reorderPatientHomeBlocks(blocks.map((block) => block.code));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Поменять порядок блоков</DialogTitle>
          <DialogDescription>Перетащите блоки в нужном порядке.</DialogDescription>
        </DialogHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {blocks.map((block) => (
                <SortableBlockRow key={block.code} block={block} />
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
