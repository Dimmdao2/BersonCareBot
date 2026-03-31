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
  reorderMotivationQuotes,
  setQuoteActive,
  setQuoteArchived,
  upsertMotivationQuote,
  type NewsActionState,
} from "./actions";

export type QuoteRow = {
  id: string;
  body_text: string;
  author: string | null;
  is_active: boolean;
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

function SortableQuoteRow({
  q,
  expanded,
  onToggleExpand,
  onToggleActive,
  quoteAction,
  quotePending,
  formPending,
}: {
  q: QuoteRow;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleActive: (id: string, next: boolean) => void;
  quoteAction: (formData: FormData) => void;
  quotePending: boolean;
  formPending: boolean;
}) {
  const archived = q.archived_at != null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
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
      <div className="flex items-start gap-2">
        <DragHandle listeners={listeners as never} attributes={attributes as never} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-foreground">{q.body_text || "—"}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full border border-border/80"
          disabled={formPending || archived}
          title={archived ? "В архиве" : q.is_active ? "Активна" : "Не активна"}
          aria-label={q.is_active ? "Активна" : "Не активна"}
          onClick={() => !archived && onToggleActive(q.id, !q.is_active)}
        >
          {q.is_active && !archived ? (
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
              <DropdownMenuItem onClick={() => onToggleExpand(q.id)}>
                {expanded ? "Свернуть" : "Изменить"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  void setQuoteArchived(q.id, !archived);
                }}
              >
                {archived ? "Из архива" : "Архивировать"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {q.author?.trim() ? (
        <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">{q.author}</p>
      ) : null}
      {expanded ? (
        <form action={quoteAction} className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <input type="hidden" name="id" value={q.id} />
          <input type="hidden" name="sort_order" value={String(q.sort_order)} />
          <label className="flex flex-col gap-1 text-sm">
            Текст
            <Textarea name="body_text" className="text-sm" rows={3} defaultValue={q.body_text} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Автор
            <Input name="author" defaultValue={q.author ?? ""} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={q.is_active} />
            Активна
          </label>
          <Button type="submit" className="w-fit" disabled={quotePending}>
            Сохранить
          </Button>
        </form>
      ) : null}
    </li>
  );
}

export function MotivationListClient({ quoteRows }: { quoteRows: QuoteRow[] }) {
  const [items, setItems] = useState(quoteRows);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reorderPending, startReorderTransition] = useTransition();
  const [actPending, startActTransition] = useTransition();
  const [quoteState, quoteAction, quotePending] = useActionState(upsertMotivationQuote, null as NewsActionState | null);

  useEffect(() => {
    setItems(quoteRows);
  }, [quoteRows]);

  const sortIds = items.map((q) => q.id);
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
        const res = await reorderMotivationQuotes(orderedIds);
        if (!res.ok) setItems(previous);
      });
      return next;
    });
  }, []);

  const onToggleActive = useCallback((id: string, next: boolean) => {
    startActTransition(async () => {
      await setQuoteActive(id, next);
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {quoteState?.error ? (
        <p role="alert" className="text-destructive">
          {quoteState.error}
        </p>
      ) : null}

      <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setShowAdd((v) => !v)}>
        {showAdd ? "Скрыть форму" : "Добавить"}
      </Button>

      {showAdd ? (
        <form action={quoteAction} className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4">
          <strong className="text-sm">Новая цитата</strong>
          <Textarea name="body_text" className="text-sm" rows={2} placeholder="Текст" required />
          <Input name="author" placeholder="Автор (необязательно)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked />
            Активна
          </label>
          <Button type="submit" disabled={quotePending}>
            Добавить
          </Button>
        </form>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-busy={reorderPending}>
            {items.map((q) => (
              <SortableQuoteRow
                key={q.id}
                q={q}
                expanded={expandedId === q.id}
                onToggleExpand={toggleExpand}
                onToggleActive={onToggleActive}
                quoteAction={quoteAction}
                quotePending={quotePending}
                formPending={actPending}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
