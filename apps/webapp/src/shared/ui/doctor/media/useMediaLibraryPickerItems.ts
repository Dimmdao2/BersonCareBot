"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRuSearchString } from "@/shared/lib/ruSearchNormalize";
import type { MediaListItem } from "@/shared/ui/doctor/media/MediaPickerList";
import {
  getMediaLibraryPickerListCached,
  invalidateMediaLibraryPickerListCache,
  setMediaLibraryPickerListCached,
} from "@/shared/ui/doctor/media/mediaLibraryPickerListCache";

/** Page size for picker list requests (API max 200). */
export const MEDIA_LIBRARY_PICKER_PAGE_SIZE = 50;

/** @deprecated Use {@link MEDIA_LIBRARY_PICKER_PAGE_SIZE}; kept for tests/docs referencing the old cap. */
export const MEDIA_LIBRARY_PICKER_LIST_LIMIT = 200;

export type AdminMediaListUrlSortBy = "date" | "size" | "type" | "name";

export function buildAdminMediaListUrl(args: {
  apiKind: string;
  folderId?: string | null;
  /** При выборе конкретной папки — включать вложенные (как в экране библиотеки). По умолчанию `true` для uuid-папки. */
  includeDescendants?: boolean;
  sortBy?: AdminMediaListUrlSortBy;
  sortDir?: "asc" | "desc";
  q?: string;
  offset?: number;
  limit?: number;
}): string {
  const p = new URLSearchParams();
  p.set("kind", args.apiKind);
  p.set("sortBy", args.sortBy ?? "date");
  p.set("sortDir", args.sortDir ?? "desc");
  p.set("limit", String(args.limit ?? MEDIA_LIBRARY_PICKER_PAGE_SIZE));
  p.set("offset", String(args.offset ?? 0));
  if (args.q?.trim()) p.set("q", args.q.trim());
  if (args.folderId !== undefined) {
    if (args.folderId === null) p.set("folderId", "root");
    else {
      p.set("folderId", args.folderId);
      const includeDescendants = args.includeDescendants ?? true;
      if (includeDescendants) p.set("includeDescendants", "true");
    }
  }
  return `/api/admin/media?${p.toString()}`;
}

export type MediaLibraryPickerKindFilter = "image" | "video" | "image_or_video" | "all";

/**
 * After server list: for `image_or_video` the API uses `kind=all`, so narrow to image|video in UI.
 */
export function narrowMediaLibraryPickerItemsByKind(
  items: MediaListItem[],
  kind: MediaLibraryPickerKindFilter,
): MediaListItem[] {
  if (kind === "image_or_video") {
    return items.filter((i) => i.kind === "image" || i.kind === "video");
  }
  return items;
}

/**
 * @deprecated Prefer server `q` in {@link buildAdminMediaListUrl}. Kept for unit tests.
 */
export function filterMediaLibraryPickerItemsByQuery(items: MediaListItem[], query: string): MediaListItem[] {
  const needle = normalizeRuSearchString(query.trim());
  if (!needle) return items;
  return items.filter((item) => {
    const filename = normalizeRuSearchString(item.filename);
    const displayName = item.displayName ? normalizeRuSearchString(item.displayName) : "";
    return filename.includes(needle) || displayName.includes(needle);
  });
}

type ListResponse = {
  ok?: boolean;
  items?: MediaListItem[];
  error?: string;
  hasMore?: boolean;
  nextOffset?: number;
  total?: number;
};

/**
 * Paginated library list for picker modals. Server search via `q` in `listUrl`.
 */
export function useMediaLibraryPickerItems(options: {
  open: boolean;
  listUrl: string;
  reloadKey?: number;
}): {
  items: MediaListItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  total: number | null;
  error: string | null;
  loadMore: () => void;
} {
  const { open, listUrl, reloadKey = 0 } = options;
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [inFlight, setInFlight] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(0);
  const prevReloadKeyRef = useRef(reloadKey);

  const loading = open && inFlight && !loadingMore;

  const fetchPage = useCallback(async (url: string, offset: number, append: boolean, requestId: number) => {
    const pageUrl = (() => {
      const u = new URL(url, "http://local");
      u.searchParams.set("offset", String(offset));
      return `${u.pathname}?${u.searchParams.toString()}`;
    })();

    const res = await fetch(pageUrl, { credentials: "same-origin" });
    const data = (await res.json()) as ListResponse;
    if (!res.ok || !data.ok) throw new Error(data.error ?? "load_failed");
    if (requestId !== latestRequestRef.current) return;

    const incoming = data.items ?? [];
    setItems((prev) => {
      if (!append) return incoming;
      const known = new Set(prev.map((i) => i.id));
      return [...prev, ...incoming.filter((i) => !known.has(i.id))];
    });
    setHasMore(Boolean(data.hasMore));
    setNextOffset(data.nextOffset ?? offset + incoming.length);
    setTotal(typeof data.total === "number" ? data.total : null);
    if (!append) {
      setMediaLibraryPickerListCached(listUrl, {
        items: incoming,
        hasMore: Boolean(data.hasMore),
        nextOffset: data.nextOffset ?? incoming.length,
        total: typeof data.total === "number" ? data.total : null,
      });
    }
  }, [listUrl]);

  useEffect(() => {
    if (!open) {
      latestRequestRef.current += 1;
      return;
    }

    const reloadBumped = prevReloadKeyRef.current !== reloadKey;
    prevReloadKeyRef.current = reloadKey;

    if (!reloadBumped) {
      const cached = getMediaLibraryPickerListCached(listUrl);
      if (cached !== undefined) {
        queueMicrotask(() => {
          setItems(cached.items);
          setHasMore(cached.hasMore);
          setNextOffset(cached.nextOffset);
          setTotal(cached.total);
          setError(null);
          setInFlight(false);
          setLoadingMore(false);
        });
        return;
      }
    } else {
      invalidateMediaLibraryPickerListCache(listUrl);
    }

    const requestId = ++latestRequestRef.current;
    queueMicrotask(() => {
      setInFlight(true);
      setError(null);
      setLoadingMore(false);
      setHasMore(false);
      setNextOffset(0);
    });

    queueMicrotask(() => {
      void fetchPage(listUrl, 0, false, requestId)
        .catch(() => {
          if (requestId !== latestRequestRef.current) return;
          setError("Не удалось загрузить библиотеку");
          setItems([]);
        })
        .finally(() => {
          if (requestId !== latestRequestRef.current) return;
          setInFlight(false);
        });
    });
  }, [open, listUrl, reloadKey, fetchPage]);

  const loadMore = useCallback(() => {
    if (!open || !hasMore || inFlight || loadingMore) return;
    const requestId = latestRequestRef.current;
    setLoadingMore(true);
    setError(null);
    void fetchPage(listUrl, nextOffset, true, requestId)
      .catch(() => {
        if (requestId !== latestRequestRef.current) return;
        setError("Не удалось загрузить следующую страницу");
      })
      .finally(() => {
        if (requestId !== latestRequestRef.current) return;
        setInFlight(false);
        setLoadingMore(false);
      });
  }, [open, hasMore, inFlight, loadingMore, listUrl, nextOffset, fetchPage]);

  return { items, loading, loadingMore, hasMore, total, error, loadMore };
}

export { invalidateMediaLibraryPickerListCache } from "@/shared/ui/doctor/media/mediaLibraryPickerListCache";
