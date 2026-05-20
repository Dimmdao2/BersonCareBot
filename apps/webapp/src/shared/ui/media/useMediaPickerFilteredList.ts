"use client";

import { useMemo } from "react";
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

  const listLoading =
    baseLoading ||
    (serverSearchEnabled && !inServerMode && trimmedQuery.length > 0) ||
    (inServerMode && serverSearch.loading && serverSearch.items.length === 0);

  const serverSearchPending =
    serverSearchEnabled && !inServerMode && trimmedQuery.length > 0 && !baseError;

  return {
    listSourceItems,
    listLoading,
    listError: inServerMode ? serverSearch.error : baseError,
    listHasMore: inServerMode ? serverSearch.hasMore : baseHasMore,
    listLoadingMore: inServerMode ? serverSearch.loadingMore : baseLoadingMore,
    listTotal: inServerMode ? serverSearch.total : baseTotal,
    loadMore: inServerMode ? serverSearch.loadMore : loadMoreBase,
    inServerMode,
    serverSearchPending,
    trimmedQuery,
    basePoolItems: baseItems,
  };
}
