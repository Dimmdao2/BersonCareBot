"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import {
  doctorInlineLinkClass,
  doctorMetricValueClass,
  doctorMetricLabelClass,
} from "@/shared/ui/doctor/doctorVisual";
import { doctorClientProfileHref } from "../clients/doctorClientProfileHref";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from "@/shared/ui/doctor/doctorWorkspaceLayout";

// ── Types ───────────────────────────────────────────────────────────────────

type IntakeStatus = "new" | "in_review" | "contacted" | "booked" | "rejected" | "closed";

type IntakeItem = {
  id: string;
  patientUserId: string;
  type: "lfk" | "nutrition";
  status: IntakeStatus;
  summary: string | null;
  patientName: string;
  patientPhone: string;
  createdAt: string;
  updatedAt: string;
};

type IntakeDetail = {
  id: string;
  patientUserId: string;
  type: "lfk" | "nutrition";
  status: IntakeStatus;
  patientName: string;
  patientPhone: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  attachmentUrls?: string[];
  attachmentFiles?: Array<{
    id: string;
    url: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  answers?: Array<{ questionId: string; questionText: string; value: string; ordinal: number }>;
};

type IntakeStats = {
  days: number;
  total: number;
  byStatus: Partial<Record<IntakeStatus, number>>;
  conversionRate: number | null;
};

// ── Labels ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<IntakeStatus, string> = {
  new: "Новая",
  in_review: "В работе",
  contacted: "Связались",
  booked: "Записан",
  rejected: "Отказ",
  closed: "Закрыта",
};

const STATUS_BADGE_CLASS: Record<IntakeStatus, string> = {
  new: "bg-destructive/10 text-destructive border-destructive/40",
  in_review: "bg-muted text-muted-foreground border-border",
  contacted: "bg-muted text-muted-foreground border-border",
  booked: "bg-primary/10 text-primary border-primary/30",
  rejected: "bg-muted text-muted-foreground border-border",
  closed: "bg-muted/50 text-muted-foreground/70 border-border/50",
};

const TYPE_LABELS: Record<string, string> = { lfk: "ЛФК", nutrition: "Нутрициология" };

/** Статусы, по которым доступна фильтрация. Пустое множество = все заявки. */
const FILTER_CHIPS: { status: IntakeStatus; label: string }[] = [
  { status: "new", label: "Новые" },
  { status: "in_review", label: "В работе" },
  { status: "booked", label: "Записанные" },
  { status: "rejected", label: "Отказанные" },
];

const STATS_DAYS_OPTIONS = [7, 30, 90, 365] as const;
type StatsDays = (typeof STATS_DAYS_OPTIONS)[number];

const STATS_DAYS_LABELS: Record<StatsDays, string> = {
  7: "7 дн",
  30: "30 дн",
  90: "90 дн",
  365: "Год",
};

function formatIntakeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return `сегодня · ${d.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// ── Detail body ─────────────────────────────────────────────────────────────

function IntakeDetailBody({ detail }: { detail: IntakeDetail }) {
  return (
    <>
      {detail.type === "lfk" && detail.description && (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm whitespace-pre-wrap">
          {detail.description}
        </div>
      )}
      {detail.type === "lfk" &&
        (detail.attachmentUrls?.length || detail.attachmentFiles?.length) ? (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Вложения
          </p>
          <ul className="list-disc pl-4 space-y-1 text-xs">
            {(detail.attachmentUrls ?? []).map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className={doctorInlineLinkClass}>
                  {u}
                </a>
                <span className="text-muted-foreground ml-1">(ссылка)</span>
              </li>
            ))}
            {(detail.attachmentFiles ?? []).map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className={doctorInlineLinkClass}>
                  {f.originalName}
                </a>
                <span className="text-muted-foreground ml-1">
                  ({f.mimeType}, {(f.sizeBytes / 1024).toFixed(1)} KB)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail.type === "nutrition" &&
        detail.answers?.map((a) => (
          <div key={a.questionId}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
              {a.questionText}
            </p>
            <p className="text-sm whitespace-pre-wrap">{a.value}</p>
          </div>
        ))}
    </>
  );
}

// ── Stats card ───────────────────────────────────────────────────────────────

function IntakeStatsCard({
  stats,
  days,
  onDaysChange,
  collapsed,
  onToggle,
}: {
  stats: IntakeStats | null;
  days: StatsDays;
  onDaysChange: (d: StatsDays) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between border-b border-border bg-muted/20 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold">
          Статистика заявок {collapsed ? "▸" : "▾"}
        </span>
        {!collapsed && (
          <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {STATS_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDaysChange(d)}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                  days === d
                    ? "bg-primary/15 text-primary"
                    : "border border-border text-muted-foreground hover:bg-muted/40",
                )}
              >
                {STATS_DAYS_LABELS[d]}
              </button>
            ))}
          </span>
        )}
      </button>

      {!collapsed && (
        <>
          {stats ? (
            <>
              <div className="grid grid-cols-5 divide-x divide-border">
                {(
                  [
                    { key: "total" as const, label: "Всего", value: stats.total, muted: false },
                    { key: "new" as const, label: "Новые", value: stats.byStatus["new"] ?? 0, danger: true },
                    { key: "in_review" as const, label: "В работе", value: stats.byStatus["in_review"] ?? 0, muted: false },
                    { key: "booked" as const, label: "Записаны", value: stats.byStatus["booked"] ?? 0, muted: false },
                    { key: "rejected" as const, label: "Отказ", value: stats.byStatus["rejected"] ?? 0, muted: true },
                  ] as const
                ).map((tile) => (
                  <div
                    key={tile.key}
                    className={cn(
                      "px-2 py-2.5",
                      tile.key === "new" && tile.value > 0 && "bg-destructive/5",
                    )}
                  >
                    <div className={doctorMetricLabelClass}>{tile.label}</div>
                    <div
                      className={cn(
                        doctorMetricValueClass,
                        tile.key === "new" && tile.value > 0 && "text-destructive",
                        tile.key === "rejected" && "text-muted-foreground",
                      )}
                    >
                      {tile.key === "total" ? stats.total : (stats.byStatus[tile.key] ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border bg-muted/10 px-3 py-1.5 text-xs text-muted-foreground">
                Конверсия в запись:{" "}
                <strong className="text-foreground">
                  {stats.conversionRate !== null
                    ? `${Math.round(stats.conversionRate * 100)}%`
                    : "—"}
                </strong>
              </div>
            </>
          ) : (
            <div className="px-3 py-3 text-xs text-muted-foreground">Загрузка статистики…</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export type DoctorOnlineIntakeClientProps = {
  initialOpenRequestId?: string | null;
  onDetailChange?: (id: string | null) => void;
};

export function DoctorOnlineIntakeClient({
  initialOpenRequestId = null,
  onDetailChange,
}: DoctorOnlineIntakeClientProps) {
  const [allItems, setAllItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Мультитоггл статусов: клик вкл/выкл конкретный статус.
   * Пустое множество = показать все заявки.
   */
  // Дефолт — только «Новые» (активные заявки врача). Клик по чипу снимает фильтр → все.
  const [selectedStatuses, setSelectedStatuses] = useState<Set<IntakeStatus>>(
    () => new Set<IntakeStatus>(["new"]),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Stats
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [statsDays, setStatsDays] = useState<StatsDays>(30);
  const [stats, setStats] = useState<IntakeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Reply
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccessId, setReplySuccessId] = useState<string | null>(null);

  // Актуальный selectedId для эффектов/гонок без перезапуска эффектов на каждое изменение.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Токен последнего запроса детали: применяем результат только если он всё ещё актуален
  // (защита от гонки при быстром переключении заявок).
  const detailReqRef = useRef(0);

  const loadDetail = useCallback(async (id: string): Promise<void> => {
    const token = ++detailReqRef.current;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/doctor/online-intake/${encodeURIComponent(id)}`);
      if (token !== detailReqRef.current) return;
      if (!res.ok) {
        // если эта заявка всё ещё выбрана — снимаем выбор
        setSelectedId((cur) => (cur === id ? null : cur));
        return;
      }
      const loaded = (await res.json()) as IntakeDetail;
      if (token !== detailReqRef.current) return;
      setDetail(loaded);
    } finally {
      if (token === detailReqRef.current) setDetailLoading(false);
    }
  }, []);

  const fetchList = useCallback(async () => {
    const res = await fetch("/api/doctor/online-intake");
    if (!res.ok) return null;
    const data = (await res.json()) as { items: IntakeItem[]; total: number };
    return data.items;
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchList();
      if (items) setAllItems(items);
    } finally {
      setLoading(false);
    }
  }, [fetchList]);

  const loadStats = useCallback(async (days: StatsDays) => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/doctor/online-intake/stats?days=${days}`);
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; stats: IntakeStats };
      if (data.ok) setStats(data.stats);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!statsCollapsed) {
      void loadStats(statsDays);
    }
  }, [statsDays, statsCollapsed, loadStats]);

  // Deep-link: открыть конкретную заявку из URL (?id=).
  // Реагируем только на ВНЕШНИЙ deep-link: если заявка уже выбрана (echo от нашего же
  // onDetailChange после клика), повторно не грузим — иначе двойной фетч и мерцание.
  useEffect(() => {
    const id = initialOpenRequestId?.trim();
    if (!id) return;
    if (selectedIdRef.current === id) return;
    setSelectedId(id);
    setDetail(null);
    void loadDetail(id);
  }, [initialOpenRequestId, loadDetail]);

  function openDetail(id: string) {
    if (selectedId === id) {
      // toggle close: инвалидируем любой запрос детали в полёте
      detailReqRef.current++;
      setSelectedId(null);
      setDetail(null);
      setDetailLoading(false);
      setReplyText("");
      setReplyError(null);
      setReplySuccessId(null);
      onDetailChange?.(null);
      return;
    }
    setSelectedId(id);
    setDetail(null);
    setReplyText("");
    setReplyError(null);
    setReplySuccessId(null);
    onDetailChange?.(id);
    void loadDetail(id);
  }

  async function changeStatus(id: string, status: IntakeStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/doctor/online-intake/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await loadList();
        if (selectedIdRef.current === id) await loadDetail(id);
        void loadStats(statsDays);
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleReply() {
    if (!detail || !replyText.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/doctor/online-intake/${encodeURIComponent(detail.id)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setReplySuccessId(detail.id);
        setReplyText("");
        await loadList();
        // Refresh detail to show updated status (через токен-гард)
        await loadDetail(detail.id);
        void loadStats(statsDays);
        setTimeout(() => setReplySuccessId(null), 3000);
      } else {
        setReplyError(data.error ?? "Ошибка отправки");
      }
    } catch {
      setReplyError("Ошибка сети");
    } finally {
      setReplySending(false);
    }
  }

  // Filter items client-side: пустой набор = все заявки
  const filteredItems =
    selectedStatuses.size === 0
      ? allItems
      : allItems.filter((item) => selectedStatuses.has(item.status));

  const newCount = allItems.filter((i) => i.status === "new").length;
  const inReviewCount = allItems.filter((i) => i.status === "in_review").length;

  function toggleStatus(status: IntakeStatus) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  // Мобильный режим: если открыта деталь — показываем правую панель
  const mobileView = selectedId ? "detail" : "list";

  const leftPane = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Мультитоггл фильтров статусов */}
      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border bg-muted/20 px-3 py-2">
        {FILTER_CHIPS.map(({ status, label }) => {
          const count =
            status === "new" ? newCount : status === "in_review" ? inReviewCount : undefined;
          const isActive = selectedStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "border border-border text-muted-foreground hover:bg-muted/40",
              )}
              aria-pressed={isActive}
            >
              {label}
              {count !== undefined && count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {loading ? (
          <DoctorEmptyState className="flex-1 items-center justify-center py-8">
            Загрузка…
          </DoctorEmptyState>
        ) : filteredItems.length === 0 ? (
          <DoctorEmptyState className="flex-1 items-center justify-center py-8">
            {selectedStatuses.size === 0 ? "Заявок нет" : "Нет заявок в выбранных статусах"}
          </DoctorEmptyState>
        ) : (
          filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openDetail(item.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors",
                selectedId === item.id ? "bg-primary/15" : "hover:bg-muted/40",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{item.patientName}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    item.status === "new" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {item.status === "new" ? "Новая" : formatIntakeDate(item.createdAt)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {item.patientPhone} · {STATUS_LABELS[item.status]}
              </div>
              {item.summary && (
                <div className="truncate text-xs text-foreground/80">{item.summary}</div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  const rightPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <IntakeStatsCard
        stats={stats}
        days={statsDays}
        onDaysChange={(d) => setStatsDays(d)}
        collapsed={statsCollapsed}
        onToggle={() => setStatsCollapsed((v) => !v)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {!selectedId ? (
          <DoctorEmptyState
            size="sm"
            className="flex-1 items-center justify-center px-6 py-12 text-center"
          >
            <span className="text-sm font-semibold text-foreground">Выберите заявку слева</span>
            <span className="text-xs text-muted-foreground">
              Здесь отобразятся детали и форма ответа
            </span>
          </DoctorEmptyState>
        ) : detailLoading ? (
          <DoctorEmptyState className="flex-1 items-center justify-center py-8">
            Загрузка…
          </DoctorEmptyState>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-destructive">
            Не удалось загрузить заявку
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-border bg-primary/10 px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold">{detail.patientName}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Заявка · {formatIntakeDate(detail.createdAt)}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    STATUS_BADGE_CLASS[detail.status],
                  )}
                >
                  {STATUS_LABELS[detail.status]}
                </span>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Contact info */}
              <div className="border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">Телефон</span>
                  <span className="font-mono">{detail.patientPhone || "—"}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">Тип</span>
                  <Badge variant="outline" className="text-[10px]">
                    {TYPE_LABELS[detail.type] ?? detail.type}
                  </Badge>
                </div>
              </div>

              {/* Request text */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Текст заявки
                </p>
                <div className="flex flex-col gap-2">
                  <IntakeDetailBody detail={detail} />
                </div>
              </div>

              {/* Reply form */}
              {detail.status !== "closed" && (
                <div className="border-t border-border bg-muted/10 px-4 py-3">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Ответ → уходит в чат
                  </p>
                  {replySuccessId === detail.id ? (
                    <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                      Ответ отправлен
                    </p>
                  ) : (
                    <>
                      <Textarea
                        placeholder="Здравствуйте, спасибо за обращение…"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        disabled={replySending}
                        className="resize-none text-sm"
                        aria-label="Текст ответа"
                      />
                      {detail.status === "new" && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          При первом ответе заявка автоматически переходит в статус «в работе»
                        </p>
                      )}
                      {replyError && (
                        <p className="mt-1 text-xs text-destructive">{replyError}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
              {detail.status !== "closed" && replySuccessId !== detail.id && (
                <Button
                  size="sm"
                  disabled={replySending || !replyText.trim()}
                  onClick={() => void handleReply()}
                >
                  {replySending ? "Отправка…" : "Ответить"}
                </Button>
              )}
              {(detail.status === "new" ||
                detail.status === "in_review" ||
                detail.status === "contacted") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!updatingId}
                  onClick={() => void changeStatus(detail.id, "booked")}
                >
                  Записать →
                </Button>
              )}
              {(detail.status === "new" ||
                detail.status === "in_review" ||
                detail.status === "contacted") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!updatingId}
                  onClick={() => void changeStatus(detail.id, "rejected")}
                >
                  В отказ
                </Button>
              )}
              {detail.status !== "closed" && (
                <Link
                  href={doctorClientProfileHref(detail.patientUserId, {
                    profileListScope: "appointments",
                  })}
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                >
                  Карточка клиента
                </Link>
              )}
              {detail.status !== "closed" && (
                <Link
                  href={doctorClientProfileHref(detail.patientUserId, {
                    profileListScope: "appointments",
                    openChat: true,
                  })}
                  className={cn(buttonVariants({ size: "sm" }))}
                >
                  Чат
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div id="doctor-communications-intake" className="flex min-h-0 flex-1 flex-col">
      <CatalogSplitLayout
        className={cn(
          DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
          "lg:grid-cols-[1fr_1.4fr]",
        )}
        left={leftPane}
        right={rightPane}
        mobileView={mobileView}
        mobileBackSlot={
          <Button
            variant="outline"
            size="sm"
            onClick={() => openDetail(selectedId!)}
            className="mb-2"
          >
            ← К заявкам
          </Button>
        }
      />
    </div>
  );
}
