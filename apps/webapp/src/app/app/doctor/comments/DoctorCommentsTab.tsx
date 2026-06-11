"use client";

/**
 * Клиентский компонент-таб «Комментарии» для DoctorCommunicationsShell (TODO#3).
 *
 * SSR-данные (непрочитанные) передаются через пропы. История подгружается лениво
 * через /api/doctor/exercise-comments. Поиск: клиент-сначала + серверный добор.
 *
 * Reuse: DoctorExerciseCommentsList (→ ProgramItemDiscussionMessageBody).
 */
import { useState, useCallback } from "react";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorExerciseCommentsList } from "./DoctorExerciseCommentsList";
import { useDoctorExerciseCommentsSearch } from "./useDoctorExerciseCommentsSearch";

type HistoryPage = {
  ok: boolean;
  items: TodayExerciseCommentAttentionItem[];
  hasMore: boolean;
  nextCursor: DoctorExerciseCommentCursor | null;
};

export type DoctorCommentsTabProps = {
  initialItems: TodayExerciseCommentAttentionItem[];
  initialCursor: DoctorExerciseCommentCursor | null;
  hasMoreInitial: boolean;
};

export function DoctorCommentsTab({
  initialItems,
  initialCursor,
  hasMoreInitial,
}: DoctorCommentsTabProps) {
  const [allItems, setAllItems] = useState<TodayExerciseCommentAttentionItem[]>(initialItems);
  const [cursor, setCursor] = useState<DoctorExerciseCommentCursor | null>(initialCursor);
  const [hasMore, setHasMore] = useState(hasMoreInitial);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  const { filteredItems, serverActive, serverLoading, serverError } =
    useDoctorExerciseCommentsSearch(allItems, query);

  const loadMore = useCallback(async () => {
    if (!hasMore || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", JSON.stringify(cursor));
      const res = await fetch(`/api/doctor/exercise-comments?${params.toString()}`);
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as HistoryPage;
      if (!data.ok) throw new Error("response_error");
      setAllItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch {
      setHistoryError("Не удалось загрузить историю. Попробуйте ещё раз.");
    } finally {
      setHistoryLoading(false);
    }
  }, [hasMore, historyLoading, cursor]);

  const showEmpty = filteredItems.length === 0 && !serverLoading;

  return (
    <DoctorSection id="doctor-communications-comments">
      <DoctorSectionTitle>Новые комментарии по упражнениям</DoctorSectionTitle>

      <div className="mb-3">
        <Input
          type="search"
          placeholder="Поиск по пациенту или тексту"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Поиск комментариев"
        />
      </div>

      {showEmpty ? (
        <DoctorEmptyState>
          <p>
            {query.trim()
              ? "Ничего не найдено."
              : "Нет новых комментариев по упражнениям."}
          </p>
        </DoctorEmptyState>
      ) : (
        <DoctorExerciseCommentsList
          items={filteredItems}
          total={filteredItems.length}
          truncated={false}
        />
      )}

      {serverLoading && (
        <p className="text-xs text-muted-foreground">Поиск на сервере…</p>
      )}

      {(serverError ?? historyError) && (
        <p className="text-xs text-destructive">{serverError ?? historyError}</p>
      )}

      {!query.trim() && hasMore && !historyLoading && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={historyLoading}>
            Загрузить ещё
          </Button>
        </div>
      )}

      {!query.trim() && historyLoading && (
        <p className="text-xs text-muted-foreground text-center mt-3">Загрузка…</p>
      )}
    </DoctorSection>
  );
}
