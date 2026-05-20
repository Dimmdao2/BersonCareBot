"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";

const SEARCH_DEBOUNCE_MS = 300;

type ListResponse = {
  ok?: boolean;
  items?: MediaListItem[];
  error?: string;
  hasMore?: boolean;
  nextOffset?: number;
  total?: number;
};

function pageUrl(listUrlBase: string, query: string, offset: number): string {
  const u = new URL(listUrlBase, "http://local");
  u.searchParams.set("q", query.trim());
  u.searchParams.set("offset", String(offset));
  return `${u.pathname}?${u.searchParams.toString()}`;
}

/** Локально 0 совпадений и не идёт первая загрузка базового пула — можно искать на сервере. */
export function shouldRunMediaLibraryPickerServerSearch(
  localMatchCount: number,
  query: string,
  baseLoading: boolean,
): boolean {
  return query.trim().length > 0 && localMatchCount === 0 && !baseLoading;
}

/**
 * Серверный поиск для модалки: отдельный список, не смешивается с базовым пулом.
 * Включается только когда {@link shouldRunMediaLibraryPickerServerSearch} = true (после debounce).
 */
export function useMediaLibraryPickerServerSearch(options: {
  enabled: boolean;
  /** `buildAdminMediaListUrl` без `q` */
  listUrlBase: string;
  query: string;
}): {
  /** Показывать серверную выдачу вместо локального фильтра */
  active: boolean;
  items: MediaListItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  total: number | null;
  error: string | null;
  loadMore: () => void;
} {
  const { enabled, listUrlBase, query } = options;
  const trimmedQuery = query.trim();

  const [items, setItems] = useState<MediaListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debouncedReady, setDebouncedReady] = useState(false);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDebouncedReady(false);
      return;
    }
    const t = window.setTimeout(() => setDebouncedReady(true), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [enabled, trimmedQuery, listUrlBase]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean, signal: AbortSignal) => {
      const res = await fetch(pageUrl(listUrlBase, trimmedQuery, offset), {
        credentials: "same-origin",
        signal,
      });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "search_failed");
      if (signal.aborted) return;

      const incoming = data.items ?? [];
      setItems((prev) => {
        if (!append) return incoming;
        const known = new Set(prev.map((i) => i.id));
        return [...prev, ...incoming.filter((i) => !known.has(i.id))];
      });
      setHasMore(Boolean(data.hasMore));
      setNextOffset(data.nextOffset ?? offset + incoming.length);
      setTotal(typeof data.total === "number" ? data.total : null);
    },
    [listUrlBase, trimmedQuery],
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (!enabled || !debouncedReady || !trimmedQuery) {
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setNextOffset(0);
      setTotal(null);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    setItems([]);

    void fetchPage(0, false, ac.signal)
      .catch((e: unknown) => {
        if (ac.signal.aborted || requestId !== requestIdRef.current) return;
        const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
        if (name === "AbortError") return;
        setError("Не удалось выполнить поиск по библиотеке");
        setItems([]);
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      });

    return () => {
      ac.abort();
    };
  }, [enabled, debouncedReady, trimmedQuery, listUrlBase, fetchPage]);

  const loadMore = useCallback(() => {
    if (!enabled || !debouncedReady || !hasMore || loading || loadingMore) return;
    const requestId = requestIdRef.current;
    const ac = new AbortController();
    setLoadingMore(true);
    setError(null);
    void fetchPage(nextOffset, true, ac.signal)
      .catch((e: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
        if (name === "AbortError") return;
        setError("Не удалось загрузить следующую страницу");
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setLoadingMore(false);
      });
  }, [enabled, debouncedReady, hasMore, loading, loadingMore, nextOffset, fetchPage]);

  const active = enabled && debouncedReady && trimmedQuery.length > 0;

  return {
    active,
    items,
    loading: active && loading,
    loadingMore,
    hasMore,
    total,
    error,
    loadMore,
  };
}
