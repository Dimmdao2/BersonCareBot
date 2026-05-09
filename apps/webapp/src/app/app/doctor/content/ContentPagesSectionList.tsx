"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
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
import { Shield, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentLifecycleDropdown } from "./ContentLifecycleDropdown";
import { setContentPageRequiresAuth } from "./contentPageAuthActions";
import { reorderContentPagesInSection } from "./reorderContentPages";

export type ContentPageListRow = {
  id: string;
  section: string;
  slug: string;
  title: string;
  sortOrder: number;
  isPublished: boolean;
  requiresAuth: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

function buildNewPageHref(sectionSlug: string, systemParentCode?: string) {
  const p = new URLSearchParams();
  p.set("section", sectionSlug);
  if (systemParentCode?.trim()) {
    p.set("systemParentCode", systemParentCode.trim());
  }
  return `/app/doctor/content/new?${p.toString()}`;
}

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

function SortablePageRow({
  page,
  authPending,
  onToggleRequiresAuth,
}: {
  page: ContentPageListRow;
  authPending: boolean;
  onToggleRequiresAuth: (id: string, next: boolean) => void;
}) {
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 rounded-full border border-border/80"
        disabled={authPending}
        title={page.requiresAuth ? "Только для залогиненных" : "Публичная страница"}
        aria-label={page.requiresAuth ? "Только для залогиненных" : "Публичная страница"}
        onClick={() => onToggleRequiresAuth(page.id, !page.requiresAuth)}
      >
        {page.requiresAuth ? (
          <Shield className="size-4 text-amber-700 dark:text-amber-500" aria-hidden />
        ) : (
          <ShieldOff className="size-4 text-muted-foreground" aria-hidden />
        )}
      </Button>
      <ContentLifecycleDropdown page={page} />
    </li>
  );
}

export function ContentPagesSectionList({
  sectionSlug,
  sectionTitle,
  initialPages,
  showSectionHeading = true,
  /** Для подразделов внутри системной папки — иначе `/content/new` отфильтрует только `article` и список будет пустым. */
  newPageSystemParentCode,
  /** Ссылка на редактирование CMS-раздела (подразделы системной папки не в списке `/content/sections`). */
  sectionSettingsHref,
}: {
  sectionSlug: string;
  sectionTitle: string;
  initialPages: ContentPageListRow[];
  /** Если false — заголовок раздела не дублируется (родитель уже показал h2). */
  showSectionHeading?: boolean;
  newPageSystemParentCode?: string;
  sectionSettingsHref?: string;
}) {
  const [items, setItems] = useState(initialPages);
  const [pending, startTransition] = useTransition();
  const [authPending, startAuthTransition] = useTransition();

  useEffect(() => {
    setItems(initialPages);
  }, [initialPages]);

  const sortIds = useMemo(() => items.map((p) => p.id), [items]);
  /** Stable per-mount id so @dnd-kit a11y ids match SSR and client (avoids hydration mismatch on DndDescribedBy-*). */
  const dndContextId = useId();

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

  const onToggleRequiresAuth = useCallback((id: string, next: boolean) => {
    startAuthTransition(async () => {
      const res = await setContentPageRequiresAuth(id, next);
      if (res.ok) {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, requiresAuth: next } : p)));
      }
    });
  }, []);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {!showSectionHeading && sectionSettingsHref ?
          <div className="flex flex-wrap justify-end">
            <Link
              href={sectionSettingsHref}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Редактировать раздел
            </Link>
          </div>
        : null}
        {showSectionHeading ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="m-0 text-base font-semibold">{sectionTitle}</h3>
              {sectionSettingsHref ?
                <Link
                  href={sectionSettingsHref}
                  className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Редактировать раздел
                </Link>
              : null}
            </div>
            <Link
              href={buildNewPageHref(sectionSlug, newPageSystemParentCode)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Создать страницу
            </Link>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">Нет страниц в этом разделе.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!showSectionHeading && sectionSettingsHref ?
        <div className="flex flex-wrap justify-end">
          <Link
            href={sectionSettingsHref}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Редактировать раздел
          </Link>
        </div>
      : null}
      {showSectionHeading ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="m-0 text-base font-semibold">{sectionTitle}</h3>
            {sectionSettingsHref ?
              <Link
                href={sectionSettingsHref}
                className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Редактировать раздел
              </Link>
            : null}
          </div>
          <Link
            href={buildNewPageHref(sectionSlug, newPageSystemParentCode)}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Создать страницу
          </Link>
        </div>
      ) : null}
      <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2" aria-busy={pending}>
            {items.map((p) => (
              <SortablePageRow
                key={p.id}
                page={p}
                authPending={authPending}
                onToggleRequiresAuth={onToggleRequiresAuth}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
