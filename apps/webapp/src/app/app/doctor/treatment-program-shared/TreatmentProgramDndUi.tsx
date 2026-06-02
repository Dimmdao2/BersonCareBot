"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { DraggableAttributes } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortableListeners = NonNullable<ReturnType<typeof useSortable>["listeners"]>;

function useDefaultDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export function TreatmentProgramDragHandle({
  attributes,
  listeners,
  setActivatorNodeRef,
  disabled,
  className,
  ariaLabel = "Перетащить",
}: {
  attributes: DraggableAttributes;
  listeners: SortableListeners | undefined;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Button
      ref={setActivatorNodeRef}
      type="button"
      variant="outline"
      size="icon"
      className={cn("size-7 shrink-0 cursor-grab text-muted-foreground", className)}
      aria-label={ariaLabel}
      disabled={disabled}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5" />
    </Button>
  );
}

export function TreatmentProgramPipelineStagesDnd({
  stageIds,
  disabled,
  onReorder,
  children,
}: {
  stageIds: string[];
  disabled?: boolean;
  onReorder: (activeId: string, overId: string) => void | Promise<void>;
  children: ReactNode;
}) {
  const sensors = useDefaultDndSensors();

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={stageIds} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function TreatmentProgramSortablePipelineStage({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const dragHandle = (
    <TreatmentProgramDragHandle
      attributes={attributes}
      listeners={listeners}
      setActivatorNodeRef={setActivatorNodeRef}
      disabled={disabled}
    />
  );

  return (
    <section ref={setNodeRef} style={style} className={className}>
      {children(dragHandle)}
    </section>
  );
}

export function TreatmentProgramStageItemsDnd({
  sortableItemIds,
  disabled,
  onReorder,
  children,
}: {
  sortableItemIds: string[];
  disabled?: boolean;
  onReorder: (activeId: string, overId: string) => void | Promise<void>;
  children: ReactNode;
}) {
  const sensors = useDefaultDndSensors();

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void onReorder(String(active.id), String(over.id));
  };

  if (sortableItemIds.length === 0) {
    return <>{children}</>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sortableItemIds} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function TreatmentProgramSortableItemShell({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const dragHandle = (
    <TreatmentProgramDragHandle
      attributes={attributes}
      listeners={listeners}
      setActivatorNodeRef={setActivatorNodeRef}
      disabled={disabled}
    />
  );

  return (
    <li ref={setNodeRef} style={style} className={cn("list-none", className)}>
      {children(dragHandle)}
    </li>
  );
}
