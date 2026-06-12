"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import type { DoctorExerciseCommentCursor } from "@/modules/program-item-discussion/types";
import type {
  ProgramItemDiscussionMessage,
} from "@/modules/program-item-discussion/types";
import type { CommentPatientRow } from "./loadDoctorCommentPatients";
import type {
  PatientExercisesWithCommentsResult,
  ExerciseCommentStageGroup,
  ExerciseCommentItem,
} from "./loadDoctorPatientExercisesWithComments";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import { doctorClientProfileHref } from "../clients/doctorClientProfileHref";
import { doctorClientTreatmentProgramInstanceHref } from "../clients/doctorClientInstanceHref";
import { useDoctorExerciseCommentsSearch } from "./useDoctorExerciseCommentsSearch";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import {
  ExerciseMicroChart,
  type ExerciseMetricPoint,
} from "@/shared/ui/doctor/ExerciseMicroChart";

// ── Types ────────────────────────────────────────────────────────────────────

type HistoryPage = {
  ok: boolean;
  items: TodayExerciseCommentAttentionItem[];
  hasMore: boolean;
  nextCursor: DoctorExerciseCommentCursor | null;
};

type ExercisesApiResponse = {
  ok: boolean;
  data: PatientExercisesWithCommentsResult | null;
};

type DiscussionMessage = ProgramItemDiscussionMessage;

type ThreadApiResponse = {
  ok: boolean;
  messages: DiscussionMessage[];
  pageInfo: {
    direction: string;
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  totalCount: number;
  peerLastReadAt: string | null;
};

type MetricsApiResponse = {
  ok: boolean;
  points?: ExerciseMetricPoint[];
};

export type DoctorCommentsTabProps = {
  initialItems: TodayExerciseCommentAttentionItem[];
  initialCursor: DoctorExerciseCommentCursor | null;
  hasMoreInitial: boolean;
  initialPatients: CommentPatientRow[];
};

// ── Constants ────────────────────────────────────────────────────────────────

const REPLY_ERROR_LABELS: Record<string, string> = {
  empty: "Введите текст ответа",
  too_long: "Ответ слишком длинный (максимум 4000 символов)",
  program_not_doctor_assigned: "Нельзя ответить: программа не назначена врачом",
  program_item_not_active: "Нельзя ответить: элемент программы неактивен",
  feature_disabled: "Функция временно недоступна",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterPatients(patients: CommentPatientRow[], query: string): CommentPatientRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return patients;
  return patients.filter((p) => {
    if (p.displayName.toLowerCase().includes(q)) return true;
    if (p.phone?.toLowerCase().includes(q)) return true;
    if (p.telegramId?.toLowerCase().includes(q)) return true;
    if (p.maxId?.toLowerCase().includes(q)) return true;
    return false;
  });
}

function filterFeedByPatients(
  items: TodayExerciseCommentAttentionItem[],
  patientIds: ReadonlySet<string> | null,
): TodayExerciseCommentAttentionItem[] {
  if (!patientIds) return items;
  return items.filter((i) => patientIds.has(i.patientUserId));
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const time = date.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" }) + " · " + time;
}

// ── Left pane: patient row ───────────────────────────────────────────────────

function PatientRow({
  patient,
  isSelected,
  onClick,
}: {
  patient: CommentPatientRow;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 border-b border-border px-3 py-2.5 text-left transition-colors",
        isSelected ? "bg-primary/15" : "hover:bg-muted/40",
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="truncate text-sm font-semibold">
            {patient.displayName}
            <span className="ml-1 text-[10px] font-semibold text-primary">★</span>
          </span>
          {patient.unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              {patient.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── State B: exercise row ────────────────────────────────────────────────────

function ExerciseRow({
  item,
  isSelected,
  onClick,
}: {
  item: ExerciseCommentItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-left transition-colors",
        isSelected ? "bg-primary/15" : "hover:bg-muted/40",
      )}
    >
      {/* Thumbnail placeholder (no ExerciseMedia available in drill-down data) */}
      <div
        className="h-9 w-9 shrink-0 rounded bg-muted"
        aria-hidden
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.latestCommentAt && (
          <p className="truncate text-xs text-muted-foreground">
            {formatRelativeTime(item.latestCommentAt)}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {item.unreadComments > 0 ? (
          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            {item.unreadComments}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{item.totalComments}</span>
        )}
      </div>
    </button>
  );
}

// ── State B: stage group ─────────────────────────────────────────────────────

function StageGroup({
  group,
  selectedItemId,
  onSelectItem,
}: {
  group: ExerciseCommentStageGroup;
  selectedItemId: string | null;
  onSelectItem: (item: ExerciseCommentItem) => void;
}) {
  const [collapsed, setCollapsed] = useState(!group.isActive);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          {group.stageTitle}
        </span>
        {!group.isActive && (
          <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">
            {collapsed ? "▶" : "▼"}
          </span>
        )}
        {group.isActive && (
          <span className="text-[10px] text-primary font-medium">активный</span>
        )}
      </button>
      {!collapsed && (
        <div>
          {group.exercises.map((ex) => (
            <ExerciseRow
              key={ex.stageItemId}
              item={ex}
              isSelected={selectedItemId === ex.stageItemId}
              onClick={() => onSelectItem(ex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── State C: thread message ──────────────────────────────────────────────────

function ThreadMessage({
  message,
  instanceId,
  stageItemId,
  peerLastReadAt,
  onReplied,
}: {
  message: DiscussionMessage;
  instanceId: string;
  stageItemId: string;
  peerLastReadAt: string | null;
  onReplied: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isPatient = message.senderRole === "patient";
  const isUnread =
    isPatient &&
    peerLastReadAt !== null &&
    message.createdAt > peerLastReadAt;

  async function handleSend() {
    if (!replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(stageItemId)}/program-note-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: replyText.trim() }),
        },
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(REPLY_ERROR_LABELS[data.error ?? ""] ?? "Ошибка отправки. Попробуйте ещё раз.");
      } else {
        setSuccess(true);
        setReplyText("");
        setReplyOpen(false);
        onReplied();
      }
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-border last:border-b-0",
        isUnread && "bg-primary/5",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-muted-foreground">
          {isPatient ? "Пациент" : "Врач"}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
      {message.body && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{message.body}</p>
      )}
      {!message.body && !message.mediaFileId && (
        <p className="text-sm text-muted-foreground italic">—</p>
      )}

      {success && (
        <p className="mt-1.5 text-xs text-primary">Ответ отправлен</p>
      )}

      {isPatient && !success && (
        <div className="mt-1.5">
          {replyOpen ? (
            <div className="flex flex-col gap-1.5">
              <Textarea
                placeholder="Ответить…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                disabled={sending}
                className="text-sm resize-none"
                aria-label="Текст ответа"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={sending || !replyText.trim()}
                  onClick={() => void handleSend()}
                >
                  {sending ? "Отправка…" : "Ответить"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyText("");
                    setError(null);
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className={cn(doctorInlineLinkClass, "text-xs")}
            >
              Ответить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DoctorCommentsTab({
  initialItems,
  initialCursor,
  hasMoreInitial,
  initialPatients,
}: DoctorCommentsTabProps) {
  // ── Feed state (state A) ──
  const [allItems, setAllItems] = useState<TodayExerciseCommentAttentionItem[]>(
    initialItems ?? [],
  );
  const [cursor, setCursor] = useState<DoctorExerciseCommentCursor | null>(
    initialCursor ?? null,
  );
  const [hasMore, setHasMore] = useState(hasMoreInitial ?? false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ── Search / filter state ──
  const [query, setQuery] = useState("");
  const [onSupportOnly, setOnSupportOnly] = useState(false);

  // ── Drill-down navigation state ──
  const [selectedPatient, setSelectedPatient] = useState<CommentPatientRow | null>(null);

  // State B: exercises
  const [exercisesData, setExercisesData] = useState<PatientExercisesWithCommentsResult | null>(null);
  const [exercisesLoading, setExercisesLoading] = useState(false);
  const [exercisesError, setExercisesError] = useState<string | null>(null);

  // State C: thread
  const [selectedExercise, setSelectedExercise] = useState<ExerciseCommentItem | null>(null);
  const [threadMessages, setThreadMessages] = useState<DiscussionMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [markReadSent, setMarkReadSent] = useState(false);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);

  // State C: exercise metrics micro-chart
  const [metricsPoints, setMetricsPoints] = useState<ExerciseMetricPoint[] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const threadVersionRef = useRef(0);

  // ── Computed: filtered patients ──
  const allPatients = initialPatients ?? [];
  const filteredPatients = filterPatients(
    onSupportOnly ? allPatients : allPatients,
    query,
  );
  // onSupportOnly filter: all patients are already on-support, so toggle controls visibility
  const patientsToShow = onSupportOnly
    ? filteredPatients.filter((p) => p.isOnSupport)
    : filteredPatients;

  // Ids of patients visible in left pane (for filtering feed)
  const visiblePatientIds: ReadonlySet<string> | null =
    query.trim() || onSupportOnly
      ? new Set(patientsToShow.map((p) => p.patientUserId))
      : null;

  // ── Feed search (state A) ──
  const feedForSearch = filterFeedByPatients(allItems, visiblePatientIds);
  const { filteredItems: filteredFeed, serverLoading, serverError } = useDoctorExerciseCommentsSearch(
    feedForSearch,
    query,
  );

  // ── Load exercises for selected patient (state B) ──
  const loadExercises = useCallback(async (patientUserId: string) => {
    setExercisesLoading(true);
    setExercisesError(null);
    setExercisesData(null);
    try {
      const res = await fetch(
        `/api/doctor/comments/patients/${encodeURIComponent(patientUserId)}/exercises?includePastPrograms=true`,
      );
      const data = (await res.json()) as ExercisesApiResponse;
      if (!data.ok) throw new Error("api_error");
      setExercisesData(data.data);
    } catch {
      setExercisesError("Не удалось загрузить упражнения пациента.");
    } finally {
      setExercisesLoading(false);
    }
  }, []);

  // Reload exercises when patient changes
  useEffect(() => {
    if (!selectedPatient) return;
    void loadExercises(selectedPatient.patientUserId);
  }, [selectedPatient, loadExercises]);

  // ── Load thread for selected exercise (state C) ──
  const loadThread = useCallback(async (instanceId: string, stageItemId: string) => {
    const version = ++threadVersionRef.current;
    setThreadLoading(true);
    setThreadError(null);
    setThreadMessages([]);
    setMarkReadSent(false);
    setPeerLastReadAt(null);
    try {
      const res = await fetch(
        `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(stageItemId)}/discussion?limit=50&direction=backward`,
      );
      const data = (await res.json()) as ThreadApiResponse;
      if (version !== threadVersionRef.current) return;
      if (!data.ok) throw new Error("api_error");
      // Sort ascending for display
      const sorted = [...(data.messages ?? [])].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      setThreadMessages(sorted);
      setPeerLastReadAt(data.peerLastReadAt ?? null);
    } catch {
      if (version !== threadVersionRef.current) return;
      setThreadError("Не удалось загрузить тред.");
    } finally {
      if (version === threadVersionRef.current) setThreadLoading(false);
    }
  }, []);

  // Mark thread as read
  const markThreadRead = useCallback(
    async (instanceId: string, stageItemId: string) => {
      if (markReadSent) return;
      setMarkReadSent(true);
      try {
        await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(stageItemId)}/discussion/read`,
          { method: "POST" },
        );
      } catch {
        // silently ignore mark-read errors
      }
    },
    [markReadSent],
  );

  useEffect(() => {
    if (!selectedExercise || !exercisesData) return;
    void loadThread(exercisesData.instanceId, selectedExercise.stageItemId);
  }, [selectedExercise, exercisesData, loadThread]);

  // ── Load exercise metrics for micro-chart (state C) ──
  const loadMetrics = useCallback(async (instanceId: string, stageItemId: string) => {
    setMetricsLoading(true);
    setMetricsPoints(null);
    try {
      const params = new URLSearchParams({ instanceId, stageItemId });
      const res = await fetch(`/api/doctor/comments/exercise-metrics?${params.toString()}`);
      const data = (await res.json()) as MetricsApiResponse;
      if (data.ok && data.points) {
        setMetricsPoints(data.points);
      } else {
        setMetricsPoints([]);
      }
    } catch {
      setMetricsPoints([]);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedExercise || !exercisesData) return;
    void loadMetrics(exercisesData.instanceId, selectedExercise.stageItemId);
  }, [selectedExercise, exercisesData, loadMetrics]);

  useEffect(() => {
    if (
      !selectedExercise ||
      !exercisesData ||
      threadMessages.length === 0 ||
      markReadSent
    )
      return;
    void markThreadRead(exercisesData.instanceId, selectedExercise.stageItemId);
  }, [selectedExercise, exercisesData, threadMessages.length, markReadSent, markThreadRead]);

  // ── Load more feed (state A) ──
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
    } catch {
      setHistoryError("Не удалось загрузить историю. Попробуйте ещё раз.");
    } finally {
      setHistoryLoading(false);
    }
  }, [hasMore, historyLoading, cursor]);

  // ── Navigation handlers ──
  function handleSelectPatient(patient: CommentPatientRow) {
    setSelectedPatient(patient);
    setSelectedExercise(null);
    setThreadMessages([]);
    setMarkReadSent(false);
    setMetricsPoints(null);
  }

  function handleDeselectPatient() {
    setSelectedPatient(null);
    setSelectedExercise(null);
    setThreadMessages([]);
    setExercisesData(null);
    setMarkReadSent(false);
    setMetricsPoints(null);
  }

  function handleSelectExercise(exercise: ExerciseCommentItem) {
    setSelectedExercise(exercise);
    setMarkReadSent(false);
    setMetricsPoints(null);
  }

  function handleCloseThread() {
    setSelectedExercise(null);
    setThreadMessages([]);
    setMarkReadSent(false);
    setMetricsPoints(null);
  }

  // ── Left pane ────────────────────────────────────────────────────────────

  const totalUnread = allPatients.reduce((s, p) => s + p.unreadCount, 0);

  const leftPane = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Search + filters header */}
      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2 space-y-1.5">
        <Input
          type="search"
          placeholder="Поиск"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full"
          aria-label="Поиск пациентов"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setOnSupportOnly((v) => !v)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              onSupportOnly
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={onSupportOnly}
          >
            ★ На сопровождении · {allPatients.length}
          </button>
          {totalUnread > 0 && (
            <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
              Непрочитанных · {totalUnread}
            </span>
          )}
        </div>
      </div>

      {/* Patient list */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {patientsToShow.length === 0 ? (
          <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-6">
            {query.trim()
              ? "Ничего не найдено"
              : "Нет пациентов с непрочитанными комментариями"}
          </DoctorEmptyState>
        ) : (
          patientsToShow.map((patient) => (
            <PatientRow
              key={patient.patientUserId}
              patient={patient}
              isSelected={selectedPatient?.patientUserId === patient.patientUserId}
              onClick={() => handleSelectPatient(patient)}
            />
          ))
        )}
      </div>
    </div>
  );

  // ── Right pane ───────────────────────────────────────────────────────────

  let rightPane: React.ReactNode;

  if (!selectedPatient) {
    // State A: feed of all comments
    rightPane = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {filteredFeed.length === 0 && !serverLoading ? (
          <DoctorEmptyState size="sm" className="flex flex-1 items-center justify-center py-10">
            {query.trim()
              ? "Ничего не найдено"
              : "Нет новых комментариев по упражнениям"}
          </DoctorEmptyState>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto">
            {filteredFeed.map((item) => (
              <button
                key={item.stageItemId}
                type="button"
                onClick={() => {
                  const patient = allPatients.find((p) => p.patientUserId === item.patientUserId);
                  if (patient) handleSelectPatient(patient);
                }}
                className="flex w-full cursor-pointer flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
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
                  «{(item.latestMessage.body ?? "").slice(0, 120)}»
                </div>
              </button>
            ))}

            {serverLoading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Поиск…</p>
            )}
            {serverError && (
              <p className="px-3 py-2 text-xs text-destructive">{serverError}</p>
            )}
            {historyError && (
              <p className="px-3 py-2 text-xs text-destructive">{historyError}</p>
            )}
            {!query.trim() && hasMore && !historyLoading && (
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
        )}
      </div>
    );
  } else if (!selectedExercise) {
    // State B: exercises of selected patient
    const totalComments = exercisesData?.totalExercisesWithComments ?? 0;
    const unreadComments = exercisesData?.totalUnreadComments ?? 0;

    rightPane = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-primary/10 px-4 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <Link
                  href={doctorClientProfileHref(selectedPatient.patientUserId, {
                    profileListScope: "appointments",
                  })}
                  className={cn(doctorInlineLinkClass, "text-sm font-semibold")}
                >
                  {selectedPatient.displayName}
                </Link>
                <span className="text-[10px] font-semibold text-primary">★ на сопровождении</span>
              </div>
              {exercisesData && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Упражнений с комментариями: {totalComments}
                  {unreadComments > 0 && (
                    <span className="ml-1.5 text-destructive font-semibold">
                      · {unreadComments} новых
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleDeselectPatient}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors text-sm leading-none"
              aria-label="Сбросить выбор пациента"
            >
              ×
            </button>
          </div>
        </div>

        {/* Exercise list */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {exercisesLoading && (
            <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8">
              Загрузка…
            </DoctorEmptyState>
          )}
          {exercisesError && (
            <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8 text-destructive">
              {exercisesError}
            </DoctorEmptyState>
          )}
          {!exercisesLoading && !exercisesError && exercisesData && (
            <>
              {exercisesData.groups.length === 0 ? (
                <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8">
                  Нет упражнений с комментариями
                </DoctorEmptyState>
              ) : (
                <div className="flex flex-col">
                  {exercisesData.groups.map((group) => (
                    <StageGroup
                      key={group.stageId}
                      group={group}
                      selectedItemId={null}
                      onSelectItem={handleSelectExercise}
                    />
                  ))}
                </div>
              )}
              {exercisesData.instanceTitle && (
                <div className="shrink-0 border-t border-border px-3 py-2">
                  <Link
                    href={doctorClientTreatmentProgramInstanceHref(
                      selectedPatient.patientUserId,
                      exercisesData.instanceId,
                      { profileListScope: "appointments" },
                    )}
                    className={cn(doctorInlineLinkClass, "text-xs")}
                  >
                    Открыть программу пациента →
                  </Link>
                </div>
              )}
            </>
          )}
          {!exercisesLoading && !exercisesError && !exercisesData && !exercisesLoading && (
            <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8">
              Нет активной программы с комментариями
            </DoctorEmptyState>
          )}
        </div>
      </div>
    );
  } else {
    // State C: thread for selected exercise
    const instanceId = exercisesData?.instanceId ?? "";

    rightPane = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* Header: breadcrumb */}
        <div className="shrink-0 border-b border-border bg-primary/10 px-4 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap text-xs text-muted-foreground">
                <Link
                  href={doctorClientProfileHref(selectedPatient.patientUserId, {
                    profileListScope: "appointments",
                  })}
                  className={cn(doctorInlineLinkClass, "text-xs")}
                >
                  {selectedPatient.displayName}
                </Link>
                <span>→</span>
                <span className="text-foreground font-medium">{selectedExercise.title}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {selectedExercise.totalComments} сообщ.
                  {selectedExercise.unreadComments > 0 && (
                    <span className="ml-1 text-destructive font-semibold">
                      · {selectedExercise.unreadComments} новых
                    </span>
                  )}
                </span>
              </div>
              {/* Микро-график статистики за последнюю неделю */}
              {metricsLoading && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">Загрузка статистики…</p>
              )}
              {!metricsLoading && metricsPoints !== null && (
                <div className="mt-2">
                  <ExerciseMicroChart points={metricsPoints} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleCloseThread}
              className={cn(doctorInlineLinkClass, "shrink-0 text-xs")}
            >
              Закрыть
            </button>
          </div>
        </div>

        {/* Thread messages */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {threadLoading && (
            <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8">
              Загрузка…
            </DoctorEmptyState>
          )}
          {threadError && (
            <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8 text-destructive">
              {threadError}
            </DoctorEmptyState>
          )}
          {!threadLoading && !threadError && threadMessages.length === 0 && (
            <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-8">
              Нет сообщений
            </DoctorEmptyState>
          )}
          {!threadLoading && !threadError && threadMessages.length > 0 && (
            <div className="flex flex-col">
              {threadMessages.map((msg) => (
                <ThreadMessage
                  key={msg.id}
                  message={msg}
                  instanceId={instanceId}
                  stageItemId={selectedExercise.stageItemId}
                  peerLastReadAt={peerLastReadAt}
                  onReplied={() => void loadThread(instanceId, selectedExercise.stageItemId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const mobileView = selectedPatient ? "detail" : "list";

  return (
    <div
      id="doctor-communications-comments"
      className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
    >
      <CatalogSplitLayout
        left={leftPane}
        right={rightPane}
        mobileView={mobileView}
        className="lg:grid-cols-[1fr_1.4fr] h-full"
      />
    </div>
  );
}
