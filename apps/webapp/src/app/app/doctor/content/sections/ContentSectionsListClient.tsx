"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { EllipsisVertical, Eye, EyeOff, Shield, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reorderContentSections } from "./reorderContentSections";
import { setSectionRequiresAuth, setSectionVisibility } from "./sectionVisibilityActions";

export type SectionListRow = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  isVisible: boolean;
  requiresAuth: boolean;
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

function SortableSectionRow({
  row,
  visPending,
  authPending,
  onToggleVisible,
  onToggleRequiresAuth,
}: {
  row: SectionListRow;
  visPending: boolean;
  authPending: boolean;
  onToggleVisible: (slug: string, next: boolean) => void;
  onToggleRequiresAuth: (slug: string, next: boolean) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.slug });
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
          href={`/app/doctor/content/sections/edit/${encodeURIComponent(row.slug)}`}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {row.title}
        </Link>
        <p className="truncate font-mono text-xs text-muted-foreground">{row.slug}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full border border-border/80"
          disabled={visPending}
          title={row.isVisible ? "Виден пациенту" : "Скрыт"}
          aria-label={row.isVisible ? "Виден пациенту" : "Скрыт"}
          onClick={() => onToggleVisible(row.slug, !row.isVisible)}
        >
          {row.isVisible ? (
            <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
          ) : (
            <EyeOff className="size-4 text-muted-foreground" aria-hidden />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full border border-border/80"
          disabled={authPending}
          title={row.requiresAuth ? "Только для залогиненных" : "Публично в каталоге"}
          aria-label={row.requiresAuth ? "Только для залогиненных" : "Публично в каталоге"}
          onClick={() => onToggleRequiresAuth(row.slug, !row.requiresAuth)}
        >
          {row.requiresAuth ? (
            <Shield className="size-4 text-amber-700 dark:text-amber-500" aria-hidden />
          ) : (
            <ShieldOff className="size-4 text-muted-foreground" aria-hidden />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-transparent hover:bg-muted"
            aria-label="Действия"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push(`/app/doctor/content/sections/edit/${encodeURIComponent(row.slug)}`)}
              >
                Редактировать
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function ContentSectionsListClient({ initialSections }: { initialSections: SectionListRow[] }) {
  const [items, setItems] = useState(initialSections);
  const [pending, startTransition] = useTransition();
  const [visPending, startVisTransition] = useTransition();
  const [authPending, startAuthTransition] = useTransition();

  useEffect(() => {
    setItems(initialSections);
  }, [initialSections]);

  const sortIds = useMemo(() => items.map((s) => s.slug), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setItems((prev) => {
        const oldIndex = prev.findIndex((p) => p.slug === active.id);
        const newIndex = prev.findIndex((p) => p.slug === over.id);
        if (oldIndex < 0 || newIndex < 0) return prev;
        const previous = prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        const orderedSlugs = next.map((p) => p.slug);
        startTransition(async () => {
          const res = await reorderContentSections(orderedSlugs);
          if (!res.ok) setItems(previous);
        });
        return next;
      });
    },
    [],
  );

  const onToggleVisible = useCallback((slug: string, next: boolean) => {
    startVisTransition(async () => {
      const res = await setSectionVisibility(slug, next);
      if (res.ok) {
        setItems((prev) => prev.map((r) => (r.slug === slug ? { ...r, isVisible: next } : r)));
      }
    });
  }, []);

  const onToggleRequiresAuth = useCallback((slug: string, next: boolean) => {
    startAuthTransition(async () => {
      const res = await setSectionRequiresAuth(slug, next);
      if (res.ok) {
        setItems((prev) => prev.map((r) => (r.slug === slug ? { ...r, requiresAuth: next } : r)));
      }
    });
  }, []);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет разделов. Создайте первый раздел или проверьте подключение к БД.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" aria-busy={pending}>
          {items.map((row) => (
            <SortableSectionRow
              key={row.slug}
              row={row}
              visPending={visPending}
              authPending={authPending}
              onToggleVisible={onToggleVisible}
              onToggleRequiresAuth={onToggleRequiresAuth}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
