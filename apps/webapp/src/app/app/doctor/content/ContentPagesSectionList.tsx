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
import { Button } from "@/shared/ui/doctor/primitives/button";
import { CMS_UNASSIGNED_SECTION_SLUG } from "@/modules/content-sections/types";
import { doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorCatalogMasterListHeader } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader";
import { VirtualizedItemGrid } from "@/shared/ui/doctor/catalog/VirtualizedItemGrid";
import {
  readDoctorCatalogViewPreference,
  writeDoctorCatalogViewPreference,
} from "@/shared/lib/doctorCatalogViewPreference";
import type { DoctorCatalogViewMode } from "@/shared/lib/doctorCatalogViewPreference";
import { ContentLifecycleDropdown } from "./ContentLifecycleDropdown";
import { ContentPageTileCard } from "./ContentPageTileCard";
import { ContentRatingChip, type ContentRatingSummary } from "./ContentRatingChip";
import { setContentPageRequiresAuth } from "./contentPageAuthActions";
import { reorderContentPagesInSection } from "./reorderContentPages";
import { SectionDeleteDialog } from "./sections/SectionDeleteDialog";

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
  /** Preview image URL (from ContentPageRow.imageUrl). Used in tile view. */
  imageUrl?: string | null;
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
  rating,
  authPending,
  onToggleRequiresAuth,
}: {
  page: ContentPageListRow;
  rating?: ContentRatingSummary | null;
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
      className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-2"
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
      <ContentRatingChip rating={rating} className="hidden shrink-0 sm:inline-flex" />
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

const CONTENT_PAGES_VIEW_STORAGE_KEY = "bersoncare.doctorCatalogView.contentPages";

export function ContentPagesSectionList({
  sectionSlug,
  sectionTitle,
  initialPages,
  ratingsById,
  showSectionHeading = true,
  /** Для подразделов внутри системной папки — иначе `/content/new` отфильтрует только `article` и список будет пустым. */
  newPageSystemParentCode,
  /** Ссылка на редактирование CMS-раздела (подразделы системной папки не в списке `/content/sections`). */
  sectionSettingsHref,
  allowDeleteSection = false,
  pagesInSectionCount,
  /** Override view mode from parent; when undefined, reads from localStorage. */
  viewMode: viewModeProp,
  onViewModeChange,
}: {
  sectionSlug: string;
  sectionTitle: string;
  initialPages: ContentPageListRow[];
  /** Per-page ★ rating aggregates keyed by page id (#2 Контент Шаг 3). */
  ratingsById?: Record<string, ContentRatingSummary>;
  /** Если false — заголовок раздела не дублируется (родитель уже показал h2). */
  showSectionHeading?: boolean;
  newPageSystemParentCode?: string;
  sectionSettingsHref?: string;
  allowDeleteSection?: boolean;
  pagesInSectionCount?: number;
  /** When provided: controlled view mode (tiles / list). */
  viewMode?: DoctorCatalogViewMode;
  onViewModeChange?: (mode: DoctorCatalogViewMode) => void;
}) {
  const [items, setItems] = useState(initialPages);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [authPending, startAuthTransition] = useTransition();

  // View mode: controlled or uncontrolled (localStorage-backed).
  // Init to an SSR-safe default ("list") and apply the stored preference AFTER mount
  // in an effect — reading localStorage in the initializer would diverge from SSR and
  // cause a hydration mismatch (same pattern as ExercisesPageClient).
  const [localViewMode, setLocalViewMode] = useState<DoctorCatalogViewMode>(viewModeProp ?? "list");

  useEffect(() => {
    if (viewModeProp) return;
    const saved = readDoctorCatalogViewPreference(CONTENT_PAGES_VIEW_STORAGE_KEY);
    if (saved) setLocalViewMode(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewModeProp]);

  const viewMode: DoctorCatalogViewMode = viewModeProp ?? localViewMode;

  const toggleViewMode = useCallback(() => {
    const next: DoctorCatalogViewMode = viewMode === "list" ? "tiles" : "list";
    if (onViewModeChange) {
      onViewModeChange(next);
    } else {
      setLocalViewMode(next);
      writeDoctorCatalogViewPreference(CONTENT_PAGES_VIEW_STORAGE_KEY, next);
    }
  }, [viewMode, onViewModeChange]);

  useEffect(() => {
    setItems(initialPages);
  }, [initialPages]);

  const pagesCount = pagesInSectionCount ?? items.length;
  const showInnerCreatePageLink = sectionSlug !== CMS_UNASSIGNED_SECTION_SLUG;

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

  // ── Shared header block ────────────────────────────────────────────────────
  const sectionManageRow =
    !showSectionHeading && sectionSettingsHref ? (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href={sectionSettingsHref}
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Редактировать раздел
        </Link>
        {allowDeleteSection ? (
          <Button
            type="button"
            variant="link"
            className="h-auto shrink-0 p-0 text-sm text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Удалить раздел…
          </Button>
        ) : null}
      </div>
    ) : null;

  const sectionHeadingRow = showSectionHeading ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={`m-0 ${doctorSectionTitleClass}`}>{sectionTitle}</h3>
        {sectionSettingsHref ? (
          <Link
            href={sectionSettingsHref}
            className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Редактировать раздел
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {showInnerCreatePageLink ? (
          <Link
            href={buildNewPageHref(sectionSlug, newPageSystemParentCode)}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Создать страницу
          </Link>
        ) : null}
        {allowDeleteSection ? (
          <Button
            type="button"
            variant="link"
            className="h-auto shrink-0 p-0 text-sm text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Удалить раздел…
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {allowDeleteSection ? (
          <SectionDeleteDialog
            showTriggerButton={false}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            sectionSlug={sectionSlug}
            sectionTitle={sectionTitle}
            pagesInSection={pagesCount}
            afterDeleteHref="/app/doctor/content"
          />
        ) : null}
        {sectionManageRow}
        {sectionHeadingRow}
        <p className="text-sm text-muted-foreground">Нет страниц в этом разделе.</p>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {allowDeleteSection ? (
        <SectionDeleteDialog
          showTriggerButton={false}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          sectionSlug={sectionSlug}
          sectionTitle={sectionTitle}
          pagesInSection={pagesCount}
          afterDeleteHref="/app/doctor/content"
        />
      ) : null}
      {sectionManageRow}
      {sectionHeadingRow}

      {/* ── List/card toggle header ── */}
      <DoctorCatalogMasterListHeader
        summaryLine={`Материалов: ${items.length}`}
        viewMode={viewMode}
        onToggleView={toggleViewMode}
        titleSort={null}
        onTitleSortChange={() => {/* sort not implemented for content pages */}}
        listBusy={pending}
      />

      {/* ── Tiles mode: VirtualizedItemGrid (DnD disabled) ── */}
      {viewMode === "tiles" ? (
        <VirtualizedItemGrid
          items={items}
          columns={3}
          estimatedRowHeight={200}
          keyExtractor={(p) => p.id}
          renderItem={(p) => <ContentPageTileCard page={p} rating={ratingsById?.[p.id]} />}
          containerClassName="flex-1 min-h-[200px]"
        />
      ) : (
        /* ── List mode: DnD sortable rows ── */
        <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2" aria-busy={pending}>
              {items.map((p) => (
                <SortablePageRow
                  key={p.id}
                  page={p}
                  rating={ratingsById?.[p.id]}
                  authPending={authPending}
                  onToggleRequiresAuth={onToggleRequiresAuth}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
