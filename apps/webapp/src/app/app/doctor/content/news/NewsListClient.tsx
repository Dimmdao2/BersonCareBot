"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
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
import { EllipsisVertical, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  reorderNewsItems,
  setNewsArchived,
  setNewsItemVisible,
  upsertNewsItem,
  type NewsActionState,
} from "./actions";
import { firstNewsBodyLine } from "./newsPreview";

export type NewsRow = {
  id: string;
  title: string;
  body_md: string;
  is_visible: boolean;
  sort_order: number;
  archived_at: Date | null;
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

function SortableNewsRow({
  n,
  expanded,
  onToggleExpand,
  onToggleVisible,
  newsAction,
  newsPending,
  formPending,
}: {
  n: NewsRow;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleVisible: (id: string, next: boolean) => void;
  newsAction: (formData: FormData) => void;
  newsPending: boolean;
  formPending: boolean;
}) {
  const archived = n.archived_at != null;
  const preview = firstNewsBodyLine(n.body_md);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: n.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card px-2 py-2 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <DragHandle listeners={listeners as never} attributes={attributes as never} />
        <div className="min-w-0 flex-1">
          {n.title.trim() ? <p className="truncate font-semibold text-foreground">{n.title}</p> : null}
          <p className="truncate whitespace-nowrap text-sm text-muted-foreground">{preview || "—"}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full border border-border/80"
          disabled={formPending || archived}
          title={archived ? "В архиве" : n.is_visible ? "Видна пациенту" : "Скрыта"}
          aria-label={n.is_visible ? "Видна пациенту" : "Скрыта"}
          onClick={() => !archived && onToggleVisible(n.id, !n.is_visible)}
        >
          {n.is_visible && !archived ? (
            <Eye className="size-4 text-green-600 dark:text-green-500" />
          ) : (
            <EyeOff className="size-4 text-muted-foreground" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Действия"
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Действия</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onToggleExpand(n.id)}>
                {expanded ? "Свернуть" : "Изменить"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void setNewsArchived(n.id, !archived);
                }}
              >
                {archived ? "Из архива" : "Архивировать"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded ? (
        <form action={newsAction} className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <input type="hidden" name="id" value={n.id} />
          <input type="hidden" name="sort_order" value={String(n.sort_order)} />
          <label className="flex flex-col gap-1 text-sm">
            Заголовок
            <Input name="title" defaultValue={n.title} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Текст (Markdown)
            <Textarea name="body_md" className="font-mono text-sm" rows={4} defaultValue={n.body_md} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_visible" defaultChecked={n.is_visible} />
            Видна пациенту
          </label>
          <Button type="submit" className="w-fit" disabled={newsPending}>
            Сохранить
          </Button>
        </form>
      ) : null}
    </li>
  );
}

export function NewsListClient({ newsRows }: { newsRows: NewsRow[] }) {
  const [items, setItems] = useState(newsRows);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reorderPending, startReorderTransition] = useTransition();
  const [visPending, startVisTransition] = useTransition();
  const [newsState, newsAction, newsPending] = useActionState(upsertNewsItem, null as NewsActionState | null);

  useEffect(() => {
    setItems(newsRows);
  }, [newsRows]);

  const sortIds = items.map((n) => n.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const previous = prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      const orderedIds = next.map((p) => p.id);
      startReorderTransition(async () => {
        const res = await reorderNewsItems(orderedIds);
        if (!res.ok) setItems(previous);
      });
      return next;
    });
  }, []);

  const onToggleVisible = useCallback((id: string, next: boolean) => {
    startVisTransition(async () => {
      await setNewsItemVisible(id, next);
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {newsState?.error ? (
        <p role="alert" className="text-destructive">
          {newsState.error}
        </p>
      ) : null}

      <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setShowAdd((v) => !v)}>
        {showAdd ? "Скрыть форму" : "Добавить"}
      </Button>

      {showAdd ? (
        <form action={newsAction} className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4">
          <strong className="text-sm">Новая новость</strong>
          <label className="flex flex-col gap-1 text-sm">
            Заголовок
            <Input name="title" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Текст (Markdown)
            <Textarea name="body_md" className="font-mono text-sm" rows={3} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_visible" />
            Видна пациенту
          </label>
          <Button type="submit" disabled={newsPending}>
            Добавить
          </Button>
        </form>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-busy={reorderPending}>
            {items.map((n) => (
              <SortableNewsRow
                key={n.id}
                n={n}
                expanded={expandedId === n.id}
                onToggleExpand={toggleExpand}
                onToggleVisible={onToggleVisible}
                newsAction={newsAction}
                newsPending={newsPending}
                formPending={visPending}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
