"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import { ContentLifecycleDropdown } from "./ContentLifecycleDropdown";
import { reorderContentPagesInSection } from "./reorderContentPages";

export type ContentPageListRow = {
  id: string;
  section: string;
  slug: string;
  title: string;
  sortOrder: number;
  isPublished: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

function DragHandle({ listeners, attributes }: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 cursor-grab touch-manipulation text-muted-foreground active:cursor-grabbing"
      aria-label="Перетащить"
      {...attributes}
      {...listeners}
    >
      <span className="flex flex-col gap-0.5" aria-hidden>
        <span className="h-0.5 w-4 rounded-full bg-current" />
        <span className="h-0.5 w-4 rounded-full bg-current" />
        <span className="h-0.5 w-4 rounded-full bg-current" />
      </span>
    </Button>
  );
}

function SortablePageRow({ page }: { page: ContentPageListRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-2 shadow-sm"
    >
      <DragHandle listeners={listeners as never} attributes={attributes as never} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/app/doctor/content/edit/${page.id}`}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {page.title}
        </Link>
        <p className="truncate font-mono text-xs text-muted-foreground">{page.slug}</p>
      </div>
      <ContentLifecycleDropdown page={page} />
    </li>
  );
}

export function ContentPagesSectionList({
  sectionSlug,
  sectionTitle,
  initialPages,
  showSectionHeading = true,
}: {
  sectionSlug: string;
  sectionTitle: string;
  initialPages: ContentPageListRow[];
  /** Если false — заголовок раздела не дублируется (родитель уже показал h2). */
  showSectionHeading?: boolean;
}) {
  const [items, setItems] = useState(initialPages);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialPages);
  }, [initialPages]);

  const sortIds = useMemo(() => items.map((p) => p.id), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setItems((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === active.id);
        const newIndex = prev.findIndex((p) => p.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return prev;
        const previous = prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        const orderedIds = next.map((p) => p.id);
        startTransition(async () => {
          const res = await reorderContentPagesInSection(sectionSlug, orderedIds);
          if (!res.ok) setItems(previous);
        });
        return next;
      });
    },
    [sectionSlug],
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {showSectionHeading ? (
          <h3 className="m-0 text-base font-semibold">{sectionTitle}</h3>
        ) : null}
        <p className="text-sm text-muted-foreground">Нет страниц в этом разделе.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showSectionHeading ? <h3 className="m-0 text-base font-semibold">{sectionTitle}</h3> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-busy={pending}>
            {items.map((p) => (
              <SortablePageRow key={p.id} page={p} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
