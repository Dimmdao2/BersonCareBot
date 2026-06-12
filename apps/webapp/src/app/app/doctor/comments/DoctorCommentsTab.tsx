"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import { doctorClientProfileHref } from "../clients/doctorClientProfileHref";
import { doctorClientTreatmentProgramInstanceHref } from "../clients/doctorClientInstanceHref";
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

const REPLY_ERROR_LABELS: Record<string, string> = {
  empty: "Введите текст ответа",
  too_long: "Ответ слишком длинный (максимум 4000 символов)",
  program_not_doctor_assigned: "Нельзя ответить: программа не назначена врачом",
  program_item_not_active: "Нельзя ответить: элемент программы неактивен",
  feature_disabled: "Функция временно недоступна",
};

export function DoctorCommentsTab({
  initialItems,
  initialCursor,
  hasMoreInitial,
}: DoctorCommentsTabProps) {
  // «Новые» (SSR-сид) держим в состоянии, чтобы отвеченный элемент можно было убрать
  // оптимистично, не дожидаясь перезагрузки страницы.
  const [newItems, setNewItems] = useState<TodayExerciseCommentAttentionItem[]>(
    initialItems ?? [],
  );
  const [allItems, setAllItems] = useState<TodayExerciseCommentAttentionItem[]>(
    initialItems ?? [],
  );
  const [cursor, setCursor] = useState<DoctorExerciseCommentCursor | null>(
    initialCursor ?? null,
  );
  const [hasMore, setHasMore] = useState(hasMoreInitial ?? false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"new" | "all">("new");
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccessId, setReplySuccessId] = useState<string | null>(null);

  const baseItems = viewMode === "new" ? newItems : allItems;

  const { filteredItems, serverLoading, serverError } = useDoctorExerciseCommentsSearch(
    baseItems,
    query,
  );

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
      setAllItems((prev) => {
        const ids = new Set(prev.map((i) => i.stageItemId));
        return [...prev, ...data.items.filter((i) => !ids.has(i.stageItemId))];
      });
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setViewMode("all");
    } catch {
      setHistoryError("Не удалось загрузить историю. Попробуйте ещё раз.");
    } finally {
      setHistoryLoading(false);
    }
  }, [hasMore, historyLoading, cursor]);

  const selectedItem = filteredItems.find((i) => i.stageItemId === selectedItemId) ?? null;

  async function handleReply() {
    if (!selectedItem || !replyText.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(selectedItem.instanceId)}/items/${encodeURIComponent(selectedItem.stageItemId)}/program-note-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: replyText.trim() }),
        },
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setReplyError(
          REPLY_ERROR_LABELS[data.error ?? ""] ?? "Ошибка отправки. Попробуйте ещё раз.",
        );
      } else {
        const repliedId = selectedItem.stageItemId;
        setReplySuccessId(repliedId);
        setReplyText("");
        // Показываем баннер «Ответ отправлен» 3 c, затем убираем элемент из списков
        // оптимистично: после ответа врача последнее сообщение становится admin → на
        // сервере он исчезнет из doctor-wide запроса при следующей загрузке.
        setTimeout(() => {
          setReplySuccessId(null);
          setNewItems((prev) => prev.filter((i) => i.stageItemId !== repliedId));
          setAllItems((prev) => prev.filter((i) => i.stageItemId !== repliedId));
          setSelectedItemId((cur) => (cur === repliedId ? null : cur));
        }, 3000);
      }
    } catch {
      setReplyError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setReplySending(false);
    }
  }

  // Число пациентов на сопровождении среди загруженных комментариев (не число строк).
  const onSupportPatientCount = new Set(allItems.map((i) => i.patientUserId)).size;

  return (
    <div
      id="doctor-communications-comments"
      className="grid min-h-[400px] gap-3"
      style={{ gridTemplateColumns: "1fr 1.4fr" }}
    >
      {/* ── Left: comment list ── */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* Header: filter chips + search */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
          <button
            type="button"
            onClick={() => setViewMode("new")}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              viewMode === "new"
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={viewMode === "new"}
          >
            Новые
          </button>
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              viewMode === "all"
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={viewMode === "all"}
          >
            Все
          </button>
          <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
            ★ На сопровождении · {onSupportPatientCount}
          </span>
          <Input
            type="search"
            placeholder="Поиск по пациенту или тексту"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 min-w-[120px] flex-1 mt-1"
            aria-label="Поиск комментариев"
          />
        </div>

        {/* Comment rows */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {filteredItems.length === 0 && !serverLoading ? (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
              {query.trim() ? "Ничего не найдено." : "Нет новых комментариев по упражнениям."}
            </div>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.stageItemId}
                type="button"
                onClick={() => {
                  setSelectedItemId(item.stageItemId);
                  setReplyText("");
                  setReplyError(null);
                  setReplySuccessId(null);
                }}
                className={cn(
                  "flex w-full cursor-pointer flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors",
                  selectedItemId === item.stageItemId
                    ? "bg-primary/15"
                    : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold truncate">
                    {item.patientDisplayName}
                    <span className="ml-1.5 text-[10px] font-semibold text-primary">★</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.latestMessageAtLabel}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.stageItemTitle}
                </div>
                <div className="truncate text-xs text-foreground/80">
                  «{(item.latestMessage.body ?? "").slice(0, 100)}»
                </div>
              </button>
            ))
          )}

          {serverLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Поиск на сервере…</p>
          )}
          {serverError && (
            <p className="px-3 py-2 text-xs text-destructive">{serverError}</p>
          )}
          {historyError && (
            <p className="px-3 py-2 text-xs text-destructive">{historyError}</p>
          )}

          {/* Load more button */}
          {!query.trim() && viewMode === "all" && hasMore && !historyLoading && (
            <div className="flex justify-center px-3 py-2">
              <Button variant="outline" size="sm" onClick={loadMore}>
                Загрузить ещё
              </Button>
            </div>
          )}
          {!query.trim() && viewMode !== "all" && hasMore && (
            <div className="flex justify-center px-3 py-2">
              <Button variant="outline" size="sm" onClick={loadMore}>
                Загрузить ещё
              </Button>
            </div>
          )}
          {historyLoading && (
            <p className="px-3 py-2 text-center text-xs text-muted-foreground">Загрузка…</p>
          )}
        </div>
      </div>

      {/* ── Right: comment detail ── */}
      <div className="flex min-h-[300px] flex-col overflow-hidden rounded-lg border border-border bg-card">
        {!selectedItem ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
            <p className="text-sm font-semibold text-foreground">Выберите комментарий слева</p>
            <p className="text-center text-xs text-muted-foreground">
              Ответ уйдёт в чат, привязан к упражнению
            </p>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="shrink-0 border-b border-border bg-primary/10 px-4 py-2.5">
              <div className="text-sm font-semibold">
                {selectedItem.patientDisplayName}
                <span className="ml-1.5 text-[10px] font-semibold text-primary">★ на сопровождении</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{selectedItem.latestMessageAtLabel}</div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Exercise block */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Упражнение
                </p>
                <div className="flex gap-3 rounded-md border border-border bg-muted/20 p-2">
                  <div className="h-12 w-16 shrink-0 rounded-sm bg-border" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{selectedItem.stageItemTitle}</p>
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <Link href={selectedItem.href} className={cn(doctorInlineLinkClass, "text-xs")}>
                        Открыть упражнение →
                      </Link>
                      <Link
                        href={doctorClientTreatmentProgramInstanceHref(
                          selectedItem.patientUserId,
                          selectedItem.instanceId,
                          { profileListScope: "appointments" },
                        )}
                        className={cn(doctorInlineLinkClass, "text-xs")}
                      >
                        Открыть программу пациента →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Patient comment */}
              <div className="px-4 pb-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Комментарий пациента
                </p>
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                  {selectedItem.latestMessage.body ?? <span className="text-muted-foreground italic">—</span>}
                </div>
              </div>

              {/* Reply form */}
              <div className="border-t border-border bg-muted/10 px-4 py-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Ответ → уходит в чат, привязан к упражнению
                </p>
                {replySuccessId === selectedItem.stageItemId ? (
                  <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                    Ответ отправлен
                  </p>
                ) : (
                  <>
                    <Textarea
                      placeholder="Это нормальная реакция, когда…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      disabled={replySending}
                      className="text-sm resize-none"
                      aria-label="Текст ответа"
                    />
                    {replyError && (
                      <p className="mt-1 text-xs text-destructive">{replyError}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
              {replySuccessId !== selectedItem.stageItemId && (
                <Button
                  size="sm"
                  disabled={replySending || !replyText.trim()}
                  onClick={() => void handleReply()}
                >
                  {replySending ? "Отправка…" : "Ответить"}
                </Button>
              )}
              <Link
                href={doctorClientProfileHref(selectedItem.patientUserId, {
                  profileListScope: "appointments",
                })}
                className={cn(doctorInlineLinkClass, "text-sm")}
              >
                Открыть карту пациента →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
