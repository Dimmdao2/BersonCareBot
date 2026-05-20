"use client";

import { useEffect, useMemo } from "react";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";
import {
  filterMediaLibraryPickerItemsByQuery,
  narrowMediaLibraryPickerItemsByKind,
  useMediaLibraryPickerItems,
  type MediaLibraryPickerKindFilter,
} from "@/shared/ui/media/useMediaLibraryPickerItems";
import {
  shouldRunMediaLibraryPickerServerSearch,
  useMediaLibraryPickerServerSearch,
} from "@/shared/ui/media/useMediaLibraryPickerServerSearch";

/** API `total` не отражает сужение `image_or_video` на клиенте. */
export function pickerListTotalForKind(
  kind: MediaLibraryPickerKindFilter,
  total: number | null,
): number | null {
  if (kind === "image_or_video") return null;
  return total;
}

/**
 * Базовый пул (пагинация) + локальный поиск + серверный fallback при 0 локальных совпадений.
 */
export function useMediaPickerFilteredList(options: {
  open: boolean;
  listUrl: string;
  kind: MediaLibraryPickerKindFilter;
  query: string;
  reloadKey?: number;
}): {
  /** Строки для отображения (до фильтров вроде «только новые») */
  listSourceItems: MediaListItem[];
  listLoading: boolean;
  listError: string | null;
  listHasMore: boolean;
  listLoadingMore: boolean;
  listTotal: number | null;
  loadMore: () => void;
  inServerMode: boolean;
  serverSearchPending: boolean;
  trimmedQuery: string;
  /** Подсказка: поиск только по уже загруженным страницам */
  localSearchHint: string | null;
  /** Для exercise-usage и прочих побочных запросов */
  basePoolItems: MediaListItem[];
} {
  const { open, listUrl, kind, query, reloadKey } = options;

  const {
    items: baseItems,
    loading: baseLoading,
    loadingMore: baseLoadingMore,
    hasMore: baseHasMore,
    total: baseTotal,
    error: baseError,
    loadMore: loadMoreBase,
  } = useMediaLibraryPickerItems({ open, listUrl, reloadKey });

  const kindFilteredBase = useMemo(
    () => narrowMediaLibraryPickerItemsByKind(baseItems, kind),
    [baseItems, kind],
  );
  const localMatches = useMemo(
    () => filterMediaLibraryPickerItemsByQuery(kindFilteredBase, query),
    [kindFilteredBase, query],
  );

  const trimmedQuery = query.trim();
  const serverSearchEnabled = shouldRunMediaLibraryPickerServerSearch(
    localMatches.length,
    query,
    baseLoading,
  );

  const serverSearch = useMediaLibraryPickerServerSearch({
    enabled: serverSearchEnabled,
    listUrlBase: listUrl,
    query,
  });

  const inServerMode = serverSearch.active;

  const serverKindFiltered = useMemo(
    () => narrowMediaLibraryPickerItemsByKind(serverSearch.items, kind),
    [serverSearch.items, kind],
  );

  const listSourceItems = inServerMode ? serverKindFiltered : localMatches;

  const rawHasMore = inServerMode ? serverSearch.hasMore : baseHasMore;
  const rawLoading = inServerMode ? serverSearch.loading : baseLoading;
  const rawLoadingMore = inServerMode ? serverSearch.loadingMore : baseLoadingMore;
  const rawTotal = inServerMode ? serverSearch.total : baseTotal;
  const loadMore = inServerMode ? serverSearch.loadMore : loadMoreBase;

  const listHasMore = rawHasMore;
  const listTotal = pickerListTotalForKind(kind, rawTotal);

  const listLoading =
    baseLoading || (inServerMode && serverSearch.loading && serverSearch.items.length === 0);

  const serverSearchPending =
    serverSearchEnabled && !inServerMode && trimmedQuery.length > 0 && !baseError;

  const localSearchHint = useMemo(() => {
    if (!trimmedQuery || inServerMode) return null;
    if (localMatches.length > 0 || baseLoading) return null;
    if (baseHasMore) {
      return "Совпадений среди загруженных файлов нет. Загрузите ещё или дождитесь поиска по всей библиотеке.";
    }
    return null;
  }, [trimmedQuery, inServerMode, localMatches.length, baseLoading, baseHasMore]);

  useEffect(() => {
    if (kind !== "image_or_video" || trimmedQuery) return;
    if (inServerMode) {
      if (rawLoading || rawLoadingMore || !rawHasMore) return;
      if (serverSearch.items.length > 0 && serverKindFiltered.length === 0) {
        loadMore();
      }
      return;
    }
    if (baseLoading || baseLoadingMore || !baseHasMore) return;
    if (baseItems.length > 0 && kindFilteredBase.length === 0) {
      loadMoreBase();
    }
  }, [
    kind,
    trimmedQuery,
    inServerMode,
    rawLoading,
    rawLoadingMore,
    rawHasMore,
    serverSearch.items.length,
    serverKindFiltered.length,
    baseItems.length,
    kindFilteredBase.length,
    baseLoading,
    baseLoadingMore,
    baseHasMore,
    loadMore,
    loadMoreBase,
  ]);

  return {
    listSourceItems,
    listLoading,
    listError: inServerMode ? serverSearch.error : baseError,
    listHasMore,
    listLoadingMore: rawLoadingMore,
    listTotal,
    loadMore,
    inServerMode,
    serverSearchPending,
    trimmedQuery,
    localSearchHint,
    basePoolItems: baseItems,
  };
}
