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
  ExerciseCommentThumbMedia,
} from "./loadDoctorPatientExercisesWithComments";
import type { ExerciseMedia } from "@/modules/lfk-exercises/types";
import { ExerciseListCatalogThumb } from "@/shared/ui/doctor/media/ExerciseListCatalogThumb";
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
import { type ExerciseMetricPoint } from "@/shared/ui/doctor/ExerciseMicroChart";
import {
  ExerciseExecutionGraph,
  type DayBar,
} from "@/shared/ui/doctor/ExerciseExecutionGraph";

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

type DayActivityApiResponse = {
  ok: boolean;
  days?: DayBar[];
};

export type DoctorCommentsTabProps = {
  initialItems: TodayExerciseCommentAttentionItem[];
  initialCursor: DoctorExerciseCommentCursor | null;
  hasMoreInitial: boolean;
  initialPatients: CommentPatientRow[];
  /** IANA timezone string for displaying dates in clinic's local time. */
  displayIana?: string;
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

/** Маппинг первого медиа снимка упражнения в `ExerciseMedia` для канон-миниатюры. */
function thumbToExerciseMedia(thumb: ExerciseCommentThumbMedia | null): ExerciseMedia | null {
  if (!thumb) return null;
  return {
    id: thumb.url,
    exerciseId: "",
    mediaUrl: thumb.url,
    mediaType: thumb.mediaType,
    sortOrder: thumb.sortOrder,
    createdAt: "",
    previewSmUrl: thumb.previewSmUrl,
    previewMdUrl: thumb.previewMdUrl,
    previewStatus: thumb.previewStatus ?? undefined,
  };
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
  const hasUnread = patient.unreadCount > 0;
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
          {/* Имя: жирное если есть непрочитанные, обычное если всё прочитано */}
          <span className={cn("truncate text-sm", hasUnread ? "font-bold" : "font-normal")}>
            {patient.displayName}
            {/* ★ = на сопровождении (визуальный маркер, НЕ фильтр) */}
            {patient.isOnSupport && (
              <span className="ml-1 text-[10px] font-semibold text-primary" title="На сопровождении">★</span>
            )}
          </span>
          {hasUnread && (
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
      {/* Превью первого медиа упражнения (канон-миниатюра 36×36). */}
      <ExerciseListCatalogThumb media={thumbToExerciseMedia(item.thumb)} />
      <div className="min-w-0 flex-1 overflow-hidden">
        {/* Название упражнения: жирное если есть непрочитанные, обычное если всё прочитано */}
        <p className={cn("truncate text-sm", item.unreadComments > 0 ? "font-bold" : "font-normal")}>
          {item.title}
        </p>
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
  entryUnreadSnapshot,
}: {
  group: ExerciseCommentStageGroup;
  selectedItemId: string | null;
  onSelectItem: (item: ExerciseCommentItem) => void;
  /** stageItemId → было ли непрочитано на входе в пациента (для ранжирования без перетасовки). */
  entryUnreadSnapshot: ReadonlyMap<string, boolean>;
}) {
  const [collapsed, setCollapsed] = useState(!group.isActive);

  // Ранжирование: непрочитанные (на момент входа) сверху, прочитанные ниже.
  // Внутри группы сохраняем серверный порядок (latestCommentAt DESC) как вторичный ключ —
  // используем стабильную сортировку. Ключ берётся из снимка входа, поэтому
  // дочитанные «в этой сессии» НЕ переезжают вверх/вниз, пока врач внутри пациента.
  const orderedExercises = group.exercises
    .map((ex, idx) => ({ ex, idx }))
    .sort((a, b) => {
      const aUnread = entryUnreadSnapshot.get(a.ex.stageItemId) ? 0 : 1;
      const bUnread = entryUnreadSnapshot.get(b.ex.stageItemId) ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return a.idx - b.idx;
    })
    .map((e) => e.ex);

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
          {orderedExercises.map((ex) => (
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
  // Внутри треда визуально различаем прочитано/непрочитано. peerLastReadAt — курсор
  // последнего прочтения врачом, снятый при ОТКРЫТИИ треда (не обновляется после
  // mark-read), поэтому подсветка «непрочитано» заморожена на время просмотра.
  // Если врач ещё не открывал тред (курсор null) — все сообщения пациента непрочитаны.
  const isUnread =
    isPatient && (peerLastReadAt === null || message.createdAt > peerLastReadAt);

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
        "border-b border-border px-4 py-3 last:border-b-0",
        isUnread
          ? "border-l-2 border-l-primary bg-primary/5"
          : isPatient && "opacity-80",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="flex items-baseline gap-1.5 text-xs font-semibold text-muted-foreground">
          {isPatient ? "Пациент" : "Врач"}
          {isUnread && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              новое
            </span>
          )}
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
  displayIana,
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

  // ── View mode: «Непрочитанные» (unread) or «Все» (all) ──
  // Default: «Все» — показать всю историю комментариев; «Непрочитанные» — только непрочитанные.
  const [viewMode, setViewMode] = useState<"unread" | "all">("all");

  // ── Search / filter state ──
  const [query, setQuery] = useState("");
  // onSupportOnly toggle removed: on-support is now ★ visual marker only (per spec), not a filter.

  // ── All-mode: lazy-loaded patients + feed (fetched on first toggle to «Все») ──
  const [allModePatients, setAllModePatients] = useState<CommentPatientRow[] | null>(null);
  const [allModePatientsLoading, setAllModePatientsLoading] = useState(false);
  const [allModePatientsError, setAllModePatientsError] = useState<string | null>(null);
  // All-mode feed: separate items/cursor/hasMore for the «Все» feed (uses listExerciseCommentsForDoctor).
  const [allModeItems, setAllModeItems] = useState<TodayExerciseCommentAttentionItem[]>([]);
  const [allModeCursor, setAllModeCursor] = useState<DoctorExerciseCommentCursor | null>(null);
  const [allModeHasMore, setAllModeHasMore] = useState(false);
  const [allModeFeedLoading, setAllModeFeedLoading] = useState(false);
  const [allModeFeedError, setAllModeFeedError] = useState<string | null>(null);
  const allModeFetchedRef = useRef(false);

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

  // State C: exercise metrics chart (CMT-01..04)
  const [metricsPoints, setMetricsPoints] = useState<ExerciseMetricPoint[] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [dayBars, setDayBars] = useState<DayBar[]>([]);
  const [chartWindowDays, setChartWindowDays] = useState<7 | 30>(7);

  const threadVersionRef = useRef(0);
  // CMT-06: stageItemId to auto-navigate to once exercisesData loads (feed click deep-link)
  const pendingStageItemIdRef = useRef<string | null>(null);
  // Снимок «непрочитанности» упражнений на момент входа в пациента (state B):
  // stageItemId → было ли непрочитано при входе. Используется для ранжирования
  // (непрочитанные сверху) БЕЗ живой перетасовки — порядок фиксируется на входе
  // и не меняется, пока врач внутри пациента; пересчитывается при смене пациента.
  const entryUnreadSnapshotRef = useRef<ReadonlyMap<string, boolean>>(new Map());
  // Зеркало exercisesData для синхронного чтения cleared-count в applyLocalRead.
  const exercisesDataRef = useRef<PatientExercisesWithCommentsResult | null>(null);

  // ── Read-state (D3) ──────────────────────────────────────────────────────
  // Локальный набор stageItemId, помеченных прочитанными в этой сессии (просмотр треда).
  // Используется, чтобы бейджи/счётчики сходились без рефетча, и чтобы прочитанное
  // уезжало вниз/выпадало из фильтра «непрочитанные» — но БЕЗ живой перетасовки,
  // пока врач внутри пациента (см. snapshot-логику ниже).
  const [locallyReadItems, setLocallyReadItems] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Зеркала для синхронного чтения внутри applyLocalRead (без устаревших замыканий
  // и без двойного учёта в StrictMode).
  const locallyReadItemsRef = useRef<ReadonlySet<string>>(locallyReadItems);
  // Локальная копия списка пациентов: server-данные + декремент unreadCount по мере чтения.
  const [patients, setPatients] = useState<CommentPatientRow[]>(initialPatients ?? []);
  useEffect(() => {
    setPatients(initialPatients ?? []);
    // Новый набор пациентов от сервера => сбрасываем локальный read-стейт сессии.
    locallyReadItemsRef.current = new Set();
    setLocallyReadItems(locallyReadItemsRef.current);
  }, [initialPatients]);

  useEffect(() => {
    exercisesDataRef.current = exercisesData;
  }, [exercisesData]);

  // ── Fetch all-mode patients + feed (lazy: on first switch to «Все») ──
  const fetchAllMode = useCallback(async () => {
    if (allModeFetchedRef.current) return;
    allModeFetchedRef.current = true;

    // Patients
    setAllModePatientsLoading(true);
    setAllModePatientsError(null);
    try {
      const res = await fetch("/api/doctor/comments/patients?mode=all");
      const data = (await res.json()) as { ok: boolean; patients?: CommentPatientRow[]; error?: string };
      if (data.ok && data.patients) {
        setAllModePatients(data.patients);
      } else {
        setAllModePatientsError("Не удалось загрузить список пациентов.");
        allModeFetchedRef.current = false; // allow retry
      }
    } catch {
      setAllModePatientsError("Ошибка сети. Попробуйте ещё раз.");
      allModeFetchedRef.current = false;
    } finally {
      setAllModePatientsLoading(false);
    }

    // Feed (all mode: full history, no on-support gate, answered threads included)
    setAllModeFeedLoading(true);
    setAllModeFeedError(null);
    try {
      const res = await fetch("/api/doctor/exercise-comments?mode=all");
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as HistoryPage;
      if (!data.ok) throw new Error("response_error");
      setAllModeItems(data.items ?? []);
      setAllModeCursor(data.nextCursor ?? null);
      setAllModeHasMore(data.hasMore ?? false);
    } catch {
      setAllModeFeedError("Не удалось загрузить ленту комментариев.");
    } finally {
      setAllModeFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "all") {
      void fetchAllMode();
    }
  }, [viewMode, fetchAllMode]);

  // CMT-06: when exercisesData loads, auto-navigate to pending stageItemId from feed click
  useEffect(() => {
    if (!exercisesData || !pendingStageItemIdRef.current) return;
    const target = pendingStageItemIdRef.current;
    pendingStageItemIdRef.current = null;
    for (const group of exercisesData.groups) {
      const ex = group.exercises.find((e) => e.stageItemId === target);
      if (ex) {
        setSelectedExercise(ex);
        setMarkReadSent(false);
        setMetricsPoints(null);
        break;
      }
    }
  }, [exercisesData]);

  // ── Computed: patients list for left pane, depends on viewMode ──
  // In "unread" mode: SSR-provided patients (already filtered to unreadCount>0).
  // In "all" mode: lazy-fetched allModePatients (all on-support with any comment).
  const activePatients = viewMode === "all" ? (allModePatients ?? []) : patients;
  const filteredPatients = filterPatients(activePatients, query);
  // on-support is now a visual ★ marker only (not a filter); show all filtered patients.
  const patientsToShowRaw = filteredPatients;
  // «Непрочитанные» mode: keep only patients with unread, but always keep selected patient
  // so it doesn't disappear from under the cursor while the doctor is reading.
  // «Все» mode: show all patients that have any comment (unreadCount may be 0).
  const patientsToShow =
    viewMode === "unread"
      ? patientsToShowRaw.filter(
          (p) =>
            p.unreadCount > 0 ||
            p.patientUserId === selectedPatient?.patientUserId,
        )
      : patientsToShowRaw;

  // Ids of patients visible in left pane (for filtering feed) — only filter when search query active
  const visiblePatientIds: ReadonlySet<string> | null =
    query.trim()
      ? new Set(patientsToShow.map((p) => p.patientUserId))
      : null;

  // ── Feed search (state A) — mode-aware ──
  // In "unread" mode: SSR initialItems (unreadOnly:true) + loadMore.
  // In "all" mode: allModeItems (unreadOnly:false) fetched lazily.
  const activeFeedItems = viewMode === "all" ? allModeItems : allItems;
  const feedForSearch = filterFeedByPatients(activeFeedItems, visiblePatientIds);
  const { filteredItems: filteredFeedRaw, serverLoading, serverError } = useDoctorExerciseCommentsSearch(
    feedForSearch,
    query,
  );
  // В режиме «Непрочитанные»: убираем локально прочитанные из ленты для сходимости счётчиков.
  // В режиме «Все»: показываем все элементы, локальный read-стейт не фильтрует.
  const filteredFeed =
    viewMode === "unread" && locallyReadItems.size > 0
      ? filteredFeedRaw.filter((item) => !locallyReadItems.has(item.stageItemId))
      : filteredFeedRaw;

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
      // Заморозить ранжирование на входе: фиксируем, какие упражнения были
      // непрочитаны (учитывая ранее прочитанное в этой сессии), чтобы порядок
      // не «прыгал», пока врач читает треды внутри пациента.
      const snapshot = new Map<string, boolean>();
      for (const group of data.data?.groups ?? []) {
        for (const ex of group.exercises) {
          snapshot.set(ex.stageItemId, ex.unreadComments > 0);
        }
      }
      entryUnreadSnapshotRef.current = snapshot;
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

  // Локальная сходимость счётчиков при просмотре треда: помечаем элемент прочитанным
  // и декрементируем бейджи упражнения/пациента, чтобы цифры сошлись без рефетча.
  // Перетасовки списков здесь НЕТ — порядок заморожен, пока врач внутри пациента.
  const applyLocalRead = useCallback(
    (patientUserId: string, stageItemId: string) => {
      if (locallyReadItemsRef.current.has(stageItemId)) return;
      locallyReadItemsRef.current = new Set(locallyReadItemsRef.current).add(stageItemId);
      setLocallyReadItems(locallyReadItemsRef.current);

      // Сколько непрочитанных снимаем — читаем из актуального снимка exercisesData (ref),
      // чтобы декремент счётчиков пациента/итога был согласован и без двойного учёта.
      const current = exercisesDataRef.current;
      let clearedUnread = 0;
      for (const group of current?.groups ?? []) {
        for (const ex of group.exercises) {
          if (ex.stageItemId === stageItemId) clearedUnread = ex.unreadComments;
        }
      }
      if (clearedUnread === 0) return;

      setExercisesData((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) => ({
                ...g,
                exercises: g.exercises.map((ex) =>
                  ex.stageItemId === stageItemId ? { ...ex, unreadComments: 0 } : ex,
                ),
              })),
              totalUnreadComments: Math.max(0, prev.totalUnreadComments - clearedUnread),
            }
          : prev,
      );
      setPatients((pp) =>
        pp.map((p) =>
          p.patientUserId === patientUserId
            ? { ...p, unreadCount: Math.max(0, p.unreadCount - clearedUnread) }
            : p,
        ),
      );
    },
    [],
  );

  // Mark thread as read
  const markThreadRead = useCallback(
    async (instanceId: string, stageItemId: string, patientUserId: string) => {
      if (markReadSent) return;
      setMarkReadSent(true);
      applyLocalRead(patientUserId, stageItemId);
      try {
        await fetch(
          `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(stageItemId)}/discussion/read`,
          { method: "POST" },
        );
      } catch {
        // silently ignore mark-read errors
      }
    },
    [markReadSent, applyLocalRead],
  );

  useEffect(() => {
    if (!selectedExercise || !exercisesData) return;
    void loadThread(exercisesData.instanceId, selectedExercise.stageItemId);
  }, [selectedExercise, exercisesData, loadThread]);

  // ── Load exercise metrics for chart (CMT-01..04) ──
  const loadMetrics = useCallback(async (instanceId: string, stageItemId: string, windowDays: 7 | 30 = 7) => {
    setMetricsLoading(true);
    setMetricsPoints(null);
    try {
      const params = new URLSearchParams({ instanceId, stageItemId, windowDays: String(windowDays) });
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

  // ── Load day-activity bars for chart (CMT-02) ──
  const loadDayBars = useCallback(async (patientUserId: string, instanceId: string, windowDays: 7 | 30 = 7) => {
    try {
      const params = new URLSearchParams({ instanceId, windowDays: String(windowDays) });
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(patientUserId)}/program-day-activity?${params.toString()}`);
      const data = (await res.json()) as DayActivityApiResponse;
      if (data.ok && data.days) {
        setDayBars(data.days);
      } else {
        setDayBars([]);
      }
    } catch {
      setDayBars([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedExercise || !exercisesData) return;
    void loadMetrics(exercisesData.instanceId, selectedExercise.stageItemId, chartWindowDays);
    void loadDayBars(exercisesData.patientUserId, exercisesData.instanceId, chartWindowDays);
  }, [selectedExercise, exercisesData, loadMetrics, loadDayBars, chartWindowDays]);

  useEffect(() => {
    if (
      !selectedExercise ||
      !exercisesData ||
      threadMessages.length === 0 ||
      markReadSent
    )
      return;
    void markThreadRead(
      exercisesData.instanceId,
      selectedExercise.stageItemId,
      exercisesData.patientUserId,
    );
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

  // ── Load more feed (all mode) ──
  const loadMoreAll = useCallback(async () => {
    if (!allModeHasMore || allModeFeedLoading) return;
    setAllModeFeedLoading(true);
    setAllModeFeedError(null);
    try {
      const params = new URLSearchParams();
      if (allModeCursor) params.set("cursor", JSON.stringify(allModeCursor));
      const params2 = new URLSearchParams(params.toString());
      params2.set("mode", "all");
      const res = await fetch(`/api/doctor/exercise-comments?${params2.toString()}`);
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as HistoryPage;
      if (!data.ok) throw new Error("response_error");
      setAllModeItems((prev) => {
        const ids = new Set(prev.map((i) => i.stageItemId));
        return [...prev, ...data.items.filter((i) => !ids.has(i.stageItemId))];
      });
      setAllModeCursor(data.nextCursor ?? null);
      setAllModeHasMore(data.hasMore ?? false);
    } catch {
      setAllModeFeedError("Не удалось загрузить историю. Попробуйте ещё раз.");
    } finally {
      setAllModeFeedLoading(false);
    }
  }, [allModeHasMore, allModeFeedLoading, allModeCursor]);

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

  const totalUnread = activePatients.reduce((s, p) => s + p.unreadCount, 0);

  // Handle view mode switch: reset navigation + query, then switch mode.
  function handleSwitchViewMode(mode: "unread" | "all") {
    if (mode === viewMode) return;
    // Reset drill-down + search so we don't leave stale state.
    setSelectedPatient(null);
    setSelectedExercise(null);
    setThreadMessages([]);
    setExercisesData(null);
    setMarkReadSent(false);
    setMetricsPoints(null);
    setQuery("");
    setViewMode(mode);
  }

  // Loading/error state for left pane in "all" mode
  const patientsLoading = viewMode === "all" && allModePatientsLoading;
  const patientsError = viewMode === "all" ? allModePatientsError : null;

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
          {/* ── View mode toggle: Непрочитанные / Все ── */}
          <button
            type="button"
            onClick={() => handleSwitchViewMode("unread")}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              viewMode === "unread"
                ? "bg-primary/15 text-primary"
                : "border border-border text-muted-foreground hover:bg-muted/40",
            )}
            aria-pressed={viewMode === "unread"}
          >
            Непрочитанные
          </button>
          <button
            type="button"
            onClick={() => handleSwitchViewMode("all")}
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
          {/* ★ На сопровождении — пассивный бейдж (маркер, не фильтр) */}
          <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground">
            ★ На сопровождении · {activePatients.filter((p) => p.isOnSupport).length}
          </span>
          {totalUnread > 0 && (
            <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
              Непрочитанных · {totalUnread}
            </span>
          )}
        </div>
      </div>

      {/* Patient list */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {patientsLoading ? (
          <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-6">
            Загрузка…
          </DoctorEmptyState>
        ) : patientsError ? (
          <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-6 text-destructive">
            {patientsError}
          </DoctorEmptyState>
        ) : patientsToShow.length === 0 ? (
          <DoctorEmptyState size="xs" className="flex flex-1 items-center justify-center py-6">
            {query.trim()
              ? "Ничего не найдено"
              : viewMode === "all"
              ? "Нет пациентов с комментариями"
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

  // ── State A: mode-aware feed helpers ──
  const feedLoading = viewMode === "all" ? allModeFeedLoading : historyLoading;
  const feedError = viewMode === "all" ? allModeFeedError : historyError;
  const feedHasMore = viewMode === "all" ? allModeHasMore : hasMore;
  const handleLoadMore = viewMode === "all" ? loadMoreAll : loadMore;
  const feedInitialLoading = viewMode === "all" && allModeFeedLoading && allModeItems.length === 0;

  if (!selectedPatient) {
    // State A: feed of all comments
    rightPane = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {feedInitialLoading ? (
          <DoctorEmptyState size="sm" className="flex flex-1 items-center justify-center py-10">
            Загрузка…
          </DoctorEmptyState>
        ) : filteredFeed.length === 0 && !serverLoading ? (
          <DoctorEmptyState size="sm" className="flex flex-1 items-center justify-center py-10">
            {query.trim()
              ? "Ничего не найдено"
              : viewMode === "all"
              ? "Нет комментариев по упражнениям"
              : "Нет новых комментариев по упражнениям"}
          </DoctorEmptyState>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto">
            {filteredFeed.map((item) => (
              <button
                key={item.stageItemId}
                type="button"
                onClick={() => {
                  const patient = activePatients.find((p) => p.patientUserId === item.patientUserId);
                  if (patient) {
                    pendingStageItemIdRef.current = item.stageItemId;
                    handleSelectPatient(patient);
                  }
                }}
                className="flex w-full cursor-pointer flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold truncate">
                    {item.patientDisplayName}
                    {/* ★ маркер: пациент на сопровождении (ищем в activePatients) */}
                    {activePatients.find((p) => p.patientUserId === item.patientUserId)?.isOnSupport && (
                      <span className="ml-1.5 text-[10px] font-semibold text-primary" title="На сопровождении">★</span>
                    )}
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
            {feedError && (
              <p className="px-3 py-2 text-xs text-destructive">{feedError}</p>
            )}
            {!query.trim() && feedHasMore && !feedLoading && (
              <div className="flex justify-center px-3 py-2">
                <Button variant="outline" size="sm" onClick={() => void handleLoadMore()}>
                  Загрузить ещё
                </Button>
              </div>
            )}
            {feedLoading && filteredFeed.length > 0 && (
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
                {selectedPatient.isOnSupport && (
                  <span className="text-[10px] font-semibold text-primary">★ на сопровождении</span>
                )}
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
                      entryUnreadSnapshot={entryUnreadSnapshotRef.current}
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
              {/* График выполнения упражнения (CMT-01..04) */}
              {metricsLoading && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">Загрузка статистики…</p>
              )}
              {!metricsLoading && (metricsPoints !== null || dayBars.length > 0) && (
                <div className="mt-2">
                  <ExerciseExecutionGraph
                    metricPoints={metricsPoints ?? []}
                    dayBars={dayBars}
                    windowDays={chartWindowDays}
                    onWindowChange={setChartWindowDays}
                    displayIana={displayIana}
                  />
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

  const mobileBackSlot = selectedExercise ? (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCloseThread}
      className="mb-2"
    >
      ← Назад
    </Button>
  ) : selectedPatient ? (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDeselectPatient}
      className="mb-2"
    >
      ← Назад
    </Button>
  ) : null;

  return (
    <div
      id="doctor-communications-comments"
      className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
    >
      <CatalogSplitLayout
        left={leftPane}
        right={rightPane}
        mobileView={mobileView}
        mobileBackSlot={mobileBackSlot}
        className="lg:grid-cols-[1fr_1.4fr] h-full"
      />
    </div>
  );
}
