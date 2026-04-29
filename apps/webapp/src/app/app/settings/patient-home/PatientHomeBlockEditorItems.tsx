"use client";

import Link from "next/link";
import { useCallback, useMemo, useTransition } from "react";
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
import { Eye, EyeOff, GripVertical, Trash2, Wrench } from "lucide-react";
import type { PatientHomeBlockCode, PatientHomeBlockItemTargetType } from "@/modules/patient-home/blocks";
import { getPatientHomeBlockEditorMetadata } from "@/modules/patient-home/blockEditorMetadata";
import type { PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  reorderPatientHomeBlockItemsAction,
  togglePatientHomeBlockItemVisibilityAction,
  deletePatientHomeBlockItemAction,
  repairPatientHomeBlockItemAction,
} from "@/app/app/settings/patient-home/actions";

function cmsEditHref(row: PatientHomeEditorItemRow): string | null {
  if (!row.resolved) return null;
  if (row.targetType === "content_section") {
    return `/app/doctor/content/sections/edit/${encodeURIComponent(row.targetRef)}`;
  }
  if (row.targetType === "content_page") {
    return `/app/doctor/content/edit/${encodeURIComponent(row.targetRef)}`;
  }
  if (row.targetType === "course") {
    return `/app/doctor/treatment-program-templates`;
  }
  return null;
}

function SortableRow({
  row,
  labels,
  onToggle,
  onDelete,
  onRepair,
  pending,
}: {
  row: PatientHomeEditorItemRow;
  labels: Record<PatientHomeBlockItemTargetType, string>;
  onToggle: (id: string, v: boolean) => void;
  onDelete: (id: string) => void;
  onRepair: (id: string) => void;
  pending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const href = cmsEditHref(row);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-card px-2 py-2 text-sm"
    >
      <button
        type="button"
        className="touch-manipulation text-muted-foreground hover:text-foreground"
        aria-label="Перетащить"
        disabled={pending}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.title}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {labels[row.targetType]} · {row.targetRef}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={pending}
          title={row.isVisible ? "Видим для пациента" : "Скрыт"}
          aria-label={row.isVisible ? "Скрыть элемент" : "Показать элемент"}
          onClick={() => onToggle(row.id, !row.isVisible)}
        >
          {row.isVisible ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        </Button>
        {!row.resolved ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            className="gap-1"
            onClick={() => onRepair(row.id)}
          >
            <Wrench className="size-3.5" aria-hidden />
            Исправить
          </Button>
        ) : href ? (
          <Link href={href} prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex")}>
            Открыть в CMS
          </Link>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          disabled={pending}
          title="Удалить из блока"
          aria-label="Удалить из блока"
          onClick={() => onDelete(row.id)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export type PatientHomeBlockEditorItemsProps = {
  blockCode: PatientHomeBlockCode;
  items: PatientHomeEditorItemRow[];
  onItemsChange: (next: PatientHomeEditorItemRow[]) => void;
};

export function PatientHomeBlockEditorItems({ blockCode, items, onItemsChange }: PatientHomeBlockEditorItemsProps) {
  const [pending, startTransition] = useTransition();
  const meta = getPatientHomeBlockEditorMetadata(blockCode);
  const labels = meta.allowedTargetTypeLabels;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(items, oldIndex, newIndex);
      onItemsChange(next);
      startTransition(async () => {
        await reorderPatientHomeBlockItemsAction(
          blockCode,
          next.map((x) => x.id),
        );
      });
    },
    [blockCode, items, onItemsChange],
  );

  const onToggle = (id: string, v: boolean) => {
    const next = items.map((i) => (i.id === id ? { ...i, isVisible: v } : i));
    onItemsChange(next);
    startTransition(async () => {
      await togglePatientHomeBlockItemVisibilityAction(blockCode, id, v);
    });
  };

  const onDelete = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    onItemsChange(next);
    startTransition(async () => {
      await deletePatientHomeBlockItemAction(blockCode, id);
    });
  };

  const onRepair = (id: string) => {
    startTransition(async () => {
      const r = await repairPatientHomeBlockItemAction(blockCode, id);
      if (r.ok) {
        onItemsChange(r.items);
      }
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" data-testid="patient-home-editor-items">
          {items.map((row) => (
            <SortableRow
              key={row.id}
              row={row}
              labels={labels}
              onToggle={onToggle}
              onDelete={onDelete}
              onRepair={onRepair}
              pending={pending}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
