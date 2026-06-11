"use client";

/**
 * Поиск по вкладке «Комментарии»: клиент-сначала + серверный добор.
 *
 * Паттерн: `useMediaLibraryPickerServerSearch`. Когда локальный фильтр даёт 0 совпадений
 * и запрос непустой — с задержкой вызываем `/api/doctor/exercise-comments?q=…` для добора
 * из полного набора истории (не только загруженной страницы).
 *
 * Экспортируемая утилита {@link shouldRunDoctorCommentsServerSearch} тестируется отдельно.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";

const DEBOUNCE_MS = 300;

const IDLE_SERVER = {
  items: [] as TodayExerciseCommentAttentionItem[],
  loading: false,
  error: null as string | null,
};

/** Условие запуска серверного добора: локальных совпадений нет, запрос задан. */
export function shouldRunDoctorCommentsServerSearch(
  localMatchCount: number,
  query: string,
): boolean {
  return query.trim().length > 0 && localMatchCount === 0;
}

type SearchState = {
  items: TodayExerciseCommentAttentionItem[];
  loading: boolean;
  error: string | null;
};

/**
 * Хук поиска комментариев для DoctorCommentsTab.
 *
 * @param allItems — весь загруженный список (начальный + подгруженный через load-more)
 * @param query    — строка поиска из инпута
 *
 * @returns filteredItems — итоговый список (локальный или серверный),
 *          serverActive  — true когда показывается серверная выдача,
 *          serverLoading — идёт запрос к серверу,
 *          serverError   — сообщение об ошибке.
 */
export function useDoctorExerciseCommentsSearch(
  allItems: TodayExerciseCommentAttentionItem[],
  query: string,
): {
  filteredItems: TodayExerciseCommentAttentionItem[];
  serverActive: boolean;
  serverLoading: boolean;
  serverError: string | null;
} {
  const trimmed = query.trim().toLowerCase();

  const localFiltered = useMemo(() => {
    if (!trimmed) return allItems;
    return allItems.filter(
      (item) =>
        item.patientDisplayName.toLowerCase().includes(trimmed) ||
        (item.latestMessage.body?.toLowerCase().includes(trimmed) ?? false) ||
        item.stageItemTitle.toLowerCase().includes(trimmed),
    );
  }, [allItems, trimmed]);

  const [server, setServer] = useState<SearchState>(IDLE_SERVER);

  const abortRef = useRef<AbortController | null>(null);
  const shouldServer = shouldRunDoctorCommentsServerSearch(localFiltered.length, query);
  const effectiveServer = shouldServer ? server : IDLE_SERVER;

  useEffect(() => {
    if (!shouldServer) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const timeoutId = window.setTimeout(() => {
      queueMicrotask(() => {
        if (ctrl.signal.aborted) return;
        setServer((s) => ({ ...s, loading: true, error: null }));
      });

      const params = new URLSearchParams({ q: query.trim() });
      fetch(`/api/doctor/exercise-comments?${params.toString()}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch_error"))))
        .then((data: { ok: boolean; items: TodayExerciseCommentAttentionItem[] }) => {
          if (!ctrl.signal.aborted) {
            setServer({ items: data.ok ? data.items : [], loading: false, error: null });
          }
        })
        .catch(() => {
          if (!ctrl.signal.aborted) {
            setServer({ items: [], loading: false, error: "Ошибка поиска" });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [shouldServer, query]);

  const serverActive =
    shouldServer &&
    (effectiveServer.loading || effectiveServer.items.length > 0 || effectiveServer.error !== null);
  const filteredItems = serverActive ? effectiveServer.items : localFiltered;

  return {
    filteredItems,
    serverActive,
    serverLoading: effectiveServer.loading,
    serverError: effectiveServer.error,
  };
}
