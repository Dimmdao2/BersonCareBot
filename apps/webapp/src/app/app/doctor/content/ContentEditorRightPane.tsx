"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import type { ContentSectionRow } from "@/modules/content-sections/ports";
import type { PublishedCourseOption } from "./ContentForm";
import { ContentForm } from "./ContentForm";
import { loadContentPageForInlineEdit } from "./inlineEditorActions";

// ---------------------------------------------------------------------------
// Type for the loaded page record (matches ContentForm's `page` prop)
// ---------------------------------------------------------------------------

type InlineContentPage = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  requiresAuth: boolean;
  videoUrl: string | null;
  imageUrl: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  linkedCourseId: string | null;
};

// ---------------------------------------------------------------------------
// useInlineContentEditor hook
// ---------------------------------------------------------------------------

export type InlineContentEditorState = {
  selectedPageId: string | null;
  loadedPage: InlineContentPage | null;
  loading: boolean;
  select: (id: string) => void;
  clear: () => void;
};

/**
 * Hook that owns selection + async-load logic for the inline master-detail editor.
 * Guards against race conditions: stale resolves are ignored when the selection changes.
 */
export function useInlineContentEditor(): InlineContentEditorState {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [loadedPage, setLoadedPage] = useState<InlineContentPage | null>(null);
  const [loading, startTransition] = useTransition();

  // Monotonic counter to detect stale loads: each select() increments it;
  // only the resolve whose generation matches the current one wins.
  const generationRef = useRef(0);

  const select = useCallback((id: string) => {
    setSelectedPageId(id);
    setLoadedPage(null); // clear stale page immediately
    const gen = ++generationRef.current;
    startTransition(async () => {
      const page = await loadContentPageForInlineEdit(id);
      // Drop stale resolves
      if (generationRef.current !== gen) return;
      setLoadedPage(page ?? null);
    });
  }, []);

  const clear = useCallback(() => {
    generationRef.current++; // invalidate any in-flight load
    setSelectedPageId(null);
    setLoadedPage(null);
  }, []);

  return { selectedPageId, loadedPage, loading, select, clear };
}

// ---------------------------------------------------------------------------
// ContentEditorRightPane component
// ---------------------------------------------------------------------------

type ContentEditorRightPaneProps = {
  selectedPageId: string | null;
  loadedPage: InlineContentPage | null;
  loading: boolean;
  clear: () => void;
  sections: ContentSectionRow[];
  publishedCourses: PublishedCourseOption[];
};

/**
 * Right pane for the inline master-detail content editor.
 * - Nothing selected: empty state prompt.
 * - Loading: skeleton.
 * - Loaded: ContentForm with onBack=clear and key=selectedPageId for force-remount.
 */
export function ContentEditorRightPane({
  selectedPageId,
  loadedPage,
  loading,
  clear,
  sections,
  publishedCourses,
}: ContentEditorRightPaneProps) {
  if (!selectedPageId) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-6 py-10">
        <p className="text-center text-sm text-muted-foreground">
          Выберите материал, чтобы открыть редактор
        </p>
      </div>
    );
  }

  if (loading && !loadedPage) {
    return (
      <div className="flex flex-col gap-4 px-6 py-6" aria-busy="true" aria-label="Загрузка редактора">
        <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted/50" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
        </div>
        <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
        <div className="h-40 animate-pulse rounded-lg bg-muted/50" />
      </div>
    );
  }

  if (!loadedPage) {
    // Loaded but null — page not found
    return (
      <div className="flex min-h-[200px] items-center justify-center px-6 py-10">
        <p className="text-center text-sm text-muted-foreground">
          Материал не найден.
        </p>
      </div>
    );
  }

  return (
    <ContentForm
      key={selectedPageId}
      page={loadedPage}
      sections={sections}
      publishedCourses={publishedCourses}
      onBack={clear}
    />
  );
}
