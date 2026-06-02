"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { DraggableAttributes } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  type SortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortableListeners = NonNullable<ReturnType<typeof useSortable>["listeners"]>;
export type TreatmentProgramStageItemsDropPreview = { activeId: string; overId: string } | null;

const noSortingDisplacementStrategy: SortingStrategy = () => null;
const ITEM_DROP_PREVIEW_DELAY_MS = 120;

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
  /** Stable per-mount id so @dnd-kit a11y ids match SSR and client (avoids hydration mismatch on DndDescribedBy-*). */
  const dndContextId = useId();

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
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
    <section ref={setNodeRef} style={style} className={cn(isDragging && "shadow-lg", className)}>
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
  children: ReactNode | ((dropPreview: TreatmentProgramStageItemsDropPreview) => ReactNode);
}) {
  const sensors = useDefaultDndSensors();
  /** Stable per-mount id so @dnd-kit a11y ids match SSR and client (avoids hydration mismatch on DndDescribedBy-*). */
  const dndContextId = useId();
  const [hoverTarget, setHoverTarget] = useState<TreatmentProgramStageItemsDropPreview>(null);
  const [dropPreview, setDropPreview] = useState<TreatmentProgramStageItemsDropPreview>(null);

  useEffect(() => {
    setDropPreview(null);
    if (!hoverTarget) return;
    const timer = window.setTimeout(() => {
      setDropPreview(hoverTarget);
    }, ITEM_DROP_PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hoverTarget]);

  const resetDragState = () => {
    setHoverTarget(null);
    setDropPreview(null);
  };

  const renderChildren = (preview: TreatmentProgramStageItemsDropPreview) =>
    typeof children === "function" ? children(preview) : children;

  const onDragStart = (_event: DragStartEvent) => {
    resetDragState();
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setHoverTarget(null);
      return;
    }
    setHoverTarget({ activeId: String(active.id), overId: String(over.id) });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    resetDragState();
    if (!over || active.id === over.id) return;
    void onReorder(String(active.id), String(over.id));
  };

  const onDragCancel = (_event: DragCancelEvent) => {
    resetDragState();
  };

  if (sortableItemIds.length === 0) {
    return <>{renderChildren(null)}</>;
  }

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={sortableItemIds} strategy={noSortingDisplacementStrategy} disabled={disabled}>
        {renderChildren(dropPreview)}
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
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
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
    <li ref={setNodeRef} style={style} className={cn("list-none", isDragging && "shadow-lg", className)}>
      {children(dragHandle)}
    </li>
  );
}
