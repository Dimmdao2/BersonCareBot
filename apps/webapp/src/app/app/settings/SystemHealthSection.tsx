"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DbStatus = "up" | "down";
type IntegratorApiStatus = "ok" | "unreachable" | "error";
type ProjectionStatus = "ok" | "degraded" | "unreachable" | "error";

type ProjectionSnapshot = {
  deadCount?: number;
  pendingCount?: number;
  processingCount?: number;
  cancelledCount?: number;
  oldestPendingAt?: string | null;
  retryDistribution?: Record<number, number>;
  retriesOverThreshold?: number;
  lastSuccessAt?: string | null;
} & Record<string, unknown>;

type PreviewStatus = "pending" | "ready" | "failed" | "skipped";
type PreviewMime = "video/quicktime" | "image/heic" | "image/heif";
type MediaPreviewStatus = "ok" | "degraded" | "error";
type MediaPreviewCounters = Record<PreviewMime, Record<PreviewStatus, number>>;

type SystemHealthPayload = {
  webappDb: DbStatus;
  integratorApi: { status: IntegratorApiStatus; db?: DbStatus };
  projection: { status: ProjectionStatus; snapshot?: ProjectionSnapshot };
  mediaCronWorkers: { status: "configured" | "not_configured" };
  mediaPreview: {
    status: MediaPreviewStatus;
    stalePendingCount: number;
    byMimeAndStatus: MediaPreviewCounters;
  };
  /** Открытые операторские инциденты (интеграции / пробы). */
  operatorIncidentsOpen?: Array<{
    id: string;
    dedupKey: string;
    direction: string;
    integration: string;
    errorClass: string;
    errorDetail: string | null;
    openedAt: string;
    lastSeenAt: string;
    occurrenceCount: number;
  }>;
  backupJobs?: Record<
    string,
    {
      lastStatus: string;
      lastStartedAt: string | null;
      lastFinishedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastDurationMs: number | null;
      lastError: string | null;
    }
  >;
  outgoingDelivery?: {
    dueBacklog: number;
    deadTotal: number;
    oldestDueAgeSeconds: number | null;
    dueByChannel: Record<string, number>;
    processingCount: number;
    lastSentAt: string | null;
    lastQueueActivityAt: string | null;
  };
  /** VIDEO_HLS_DELIVERY: hourly playback aggregates (UTC), rolling window. */
  videoPlayback: {
    status: "ok" | "error";
    windowHours: number;
    windowHoursShort?: number;
    playbackApiEnabled: boolean;
    byDelivery: { hls: number; mp4: number; file: number };
    fallbackTotal: number;
    totalResolutions: number;
    uniquePlaybackPairsFirstSeenInWindow: number;
    byDeliveryLast1h?: { hls: number; mp4: number; file: number };
    fallbackTotalLast1h?: number;
    totalResolutionsLast1h?: number;
  };
  videoPlaybackClient?: {
    status: "ok" | "degraded" | "error";
    windowHours: number;
    totalErrors: number;
    totalErrorsLast1h: number;
    byEvent: {
      hls_fatal: number;
      video_error: number;
      hls_import_failed: number;
      playback_refetch_failed: number;
      playback_refetch_exception: number;
      hls_js_unsupported: number;
    };
    byEventLast1h: {
      hls_fatal: number;
      video_error: number;
      hls_import_failed: number;
      playback_refetch_failed: number;
      playback_refetch_exception: number;
      hls_js_unsupported: number;
    };
    byDelivery: { hls: number; mp4: number; file: number };
    likelyLooping: boolean;
    recent: Array<{
      createdAt: string;
      mediaId: string;
      eventClass:
        | "hls_fatal"
        | "video_error"
        | "hls_import_failed"
        | "playback_refetch_failed"
        | "playback_refetch_exception"
        | "hls_js_unsupported";
      delivery: "hls" | "mp4" | "file" | null;
      errorDetail: string | null;
    }>;
  };
  /** Server-side errors from `/api/media/.../hls/*` proxy (DB telemetry). */
  videoHlsProxy?: {
    status: "ok" | "degraded" | "error";
    windowHours: number;
    errorsTotal24h: number;
    errorsTotal1h: number;
    byReason: Record<string, number>;
    byReasonLast1h: Record<string, number>;
    degraded: boolean;
    recent: Array<{
      createdAt: string;
      mediaId: string;
      reasonCode: string;
      artifactKind: string;
    }>;
  };
  videoTranscode: {
    status: "ok" | "degraded" | "error";
    pipelineEnabled: boolean;
    reconcileEnabled: boolean;
    pendingCount: number;
    processingCount: number;
    doneLastHour: number;
    failedLastHour: number;
    doneLast24h: number;
    failedLast24h: number;
    doneLifetime: number;
    failedLifetime: number;
    avgProcessingMsDoneLastHour: number | null;
    oldestPendingAgeSeconds: number | null;
    legacyReconcileCandidateCountWithinSizeCap: number;
    readableVideoReadyWithHlsCount: number;
    lastReconcileTick: {
      jobKey: string;
      jobFamily: string;
      lastStatus: string;
      lastFinishedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastDurationMs: number | null;
      lastError: string | null;
      metaJson: Record<string, unknown>;
    } | null;
  };
  meta?: {
    probes?: {
      webappDb?: { status: string; durationMs: number; errorCode?: string };
      integratorApi?: { status: string; durationMs: number; errorCode?: string };
      projection?: { status: string; durationMs: number; errorCode?: string };
      mediaPreview?: { status: string; durationMs: number; errorCode?: string };
      videoPlayback?: { status: string; durationMs: number; errorCode?: string };
      videoPlaybackClient?: { status: string; durationMs: number; errorCode?: string };
      videoHlsProxy?: { status: string; durationMs: number; errorCode?: string };
      videoTranscode?: { status: string; durationMs: number; errorCode?: string };
      operatorIncidents?: { status: string; durationMs: number; errorCode?: string };
      operatorBackupJobs?: { status: string; durationMs: number; errorCode?: string };
      outgoingDelivery?: { status: string; durationMs: number; errorCode?: string };
    };
  };
  fetchedAt: string;
};

/** Marker for RTL: copy outside this subtree must stay operator-friendly (plan §7). */
export const SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID = "system-health-tech-diagnostics";

function techProbeStatusHuman(status: string): string {
  if (status === "ok") return "успешно";
  if (status === "degraded") return "есть признаки деградации";
  if (status === "unreachable") return "недоступно";
  if (status === "error") return "ошибка";
  if (status === "up") return "доступен";
  if (status === "down") return "недоступен";
  if (status === "idle") return "очередь пуста";
  if (status === "active") return "активен";
  if (status === "unknown") return "неизвестно";
  if (status === "no_activity") return "нет недавней активности";
  if (status === "no_signal") return "нет последнего сигнала";
  if (status === "configured") return "настроены";
  if (status === "not_configured") return "не настроены";
  if (status === "playback_disabled") return "выключено";
  if (status === "running") return "работает";
  if (status === "pending") return "ожидает обработки";
  if (status === "processing") return "обрабатывается";
  if (status === "ready") return "готово";
  if (status === "failed") return "ошибка";
  if (status === "success") return "успешно";
  if (status === "failure") return "ошибка запуска";
  if (status === "skipped") return "пропущено";
  return status;
}

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" {
  if (
    status === "ok" ||
    status === "up" ||
    status === "running" ||
    status === "active" ||
    status === "idle"
  ) {
    return "secondary";
  }
  if (
    status === "degraded" ||
    status === "no_signal" ||
    status === "no_source" ||
    status === "no_activity" ||
    status === "playback_disabled"
  ) {
    return "outline";
  }
  return "destructive";
}

function statusDotClass(status: string): string {
  if (status === "ok" || status === "up" || status === "running" || status === "active") return "bg-emerald-500";
  if (status === "idle") return "bg-sky-500";
  if (status === "playback_disabled") return "bg-amber-500";
  if (status === "degraded" || status === "no_signal" || status === "no_source" || status === "no_activity") {
    return "bg-amber-500";
  }
  if (status === "configured") return "bg-blue-500";
  if (status === "not_configured") return "bg-zinc-400";
  return "bg-rose-500";
}

function statusLabel(status: string): string {
  if (status === "playback_disabled") return "выкл.";
  if (status === "configured") return "настроены";
  if (status === "not_configured") return "не настроены";
  return techProbeStatusHuman(status);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "нет данных";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "нет данных";
  return d.toLocaleString();
}

export function computeWorkerStatus(
  payload: SystemHealthPayload | null,
): {
  api: "active" | "down" | "unknown";
  worker: "active" | "idle" | "no_activity" | "no_signal";
  webapp: "running";
} {
  if (!payload) {
    return { api: "unknown", worker: "no_signal", webapp: "running" };
  }

  const api = payload.integratorApi.status === "ok" ? "active" : "down";
  const lastSuccessAt = payload.projection.snapshot?.lastSuccessAt;
  const pendingCount = payload.projection.snapshot?.pendingCount ?? 0;
  const processingCount = payload.projection.snapshot?.processingCount ?? 0;
  const queueEmpty = pendingCount === 0 && processingCount === 0;

  if (queueEmpty) {
    return { api, worker: "idle", webapp: "running" };
  }

  if (!lastSuccessAt) {
    return { api, worker: "no_signal", webapp: "running" };
  }
  const ageMs = Date.now() - new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { api, worker: "no_signal", webapp: "running" };
  }
  const fortyMinutesMs = 40 * 60 * 1000;
  return {
    api,
    worker: ageMs <= fortyMinutesMs ? "active" : "no_activity",
    webapp: "running",
  };
}

function workerLabel(status: "active" | "idle" | "no_activity" | "no_signal" | "down" | "unknown" | "running"): string {
  if (status === "active") return "активен";
  if (status === "idle") return "очередь пуста";
  if (status === "no_activity") return "нет недавней активности";
  if (status === "no_signal") return "нет последнего сигнала";
  if (status === "down") return "недоступен";
  if (status === "running") return "работает";
  return "неизвестно";
}

const PREVIEW_MIME_LABEL: Record<PreviewMime, string> = {
  "video/quicktime": "MOV (video/quicktime)",
  "image/heic": "HEIC (image/heic)",
  "image/heif": "HEIF (image/heif)",
};

const PREVIEW_STATUS_LABEL: Record<PreviewStatus, string> = {
  ready: "готово",
  pending: "в очереди",
  failed: "ошибка",
  skipped: "пропущено",
};

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant={statusBadgeVariant(status)} className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", statusDotClass(status))} aria-hidden />
      {statusLabel(status)}
    </Badge>
  );
}

type HealthAccordionItemProps = {
  name: string;
  status: string;
  children: ReactNode;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function TechDiagBlock({ children }: { children: ReactNode }) {
  return (
    <div data-testid={SYSTEM_HEALTH_TECH_DIAGNOSTICS_TESTID} className="mt-2 rounded border border-border/50 bg-muted/15 p-2">
      <p className="mb-2 text-xs font-medium text-foreground">Техническая диагностика</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ProbeInfo({
  probe,
  bare,
}: {
  probe?: { status: string; durationMs: number; errorCode?: string };
  bare?: boolean;
}) {
  if (!probe)
    return bare ? (
      <p className="text-muted-foreground">Нет данных пробы.</p>
    ) : (
      <TechDiagBlock>
        <p className="text-muted-foreground">Нет данных пробы.</p>
      </TechDiagBlock>
    );
  const inner = (
    <div className="space-y-1">
      <DetailRow label="Статус пробы" value={techProbeStatusHuman(probe.status)} />
      <DetailRow label="Длительность" value={`${probe.durationMs} мс`} />
      <DetailRow label="Код ошибки" value={probe.errorCode ?? "—"} />
    </div>
  );
  return bare ? inner : <TechDiagBlock>{inner}</TechDiagBlock>;
}

function HealthAccordionItem({ name, status, children }: HealthAccordionItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium">{name}</span>
        <span className="flex items-center gap-2">
          <StatusPill status={status} />
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-3 text-xs text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function operatorIncidentIntegrationHuman(code: string): string {
  const c = code.trim().toLowerCase();
  const m: Record<string, string> = {
    telegram: "Telegram",
    max: "MAX",
    vk: "ВКонтакте",
    rubitime: "Rubitime",
    google_calendar: "Google Календарь",
    gcal: "Google Календарь",
  };
  return m[c] ?? code;
}

/** Краткая интерпретация для оператора; сырой `error_class` — только в техническом блоке. */
function operatorIncidentSynopsisHuman(errorClass: string): string {
  const e = errorClass.trim();
  const known: Record<string, string> = {
    max_probe_failed: "проверка интеграции MAX завершилась с ошибкой",
    rubitime_get_schedule_failed: "не удалось получить расписание Rubitime",
    GOOGLE_EVENT_ID_MISSING: "у события нет связи с Google Calendar",
    unknown_error_class: "ошибка без детальной классификации",
  };
  const direct = known[e];
  if (direct) return direct;
  const token = /^GOOGLE_TOKEN_HTTP_(.+)$/i.exec(e);
  if (token) return `ошибка запроса к Google (HTTP ${token[1] ?? "?"})`;
  const cal = /^GOOGLE_CALENDAR_HTTP_(.+)$/i.exec(e);
  if (cal) return `ошибка API Google Calendar (HTTP ${cal[1] ?? "?"})`;
  return "смотрите код ошибки в технической диагностике карточки";
}

function operatorIncidentDirectionHuman(direction: string): string {
  const d = direction.trim().toLowerCase();
  if (d === "outbound") return "исходящий запрос к интеграции";
  if (d === "inbound") return "входящий вызов / вебхук";
  return direction;
}

/** Подписи канала доставки в health (ключи произвольные из integrator queue). */
function outgoingDeliveryChannelHuman(channel: string): string {
  const c = channel.trim().toLowerCase();
  const m: Record<string, string> = {
    telegram_bot: "Telegram-бот",
    telegram: "Telegram",
    vk: "ВКонтакте",
    email: "электронная почта",
    sms: "SMS",
    whatsapp: "WhatsApp",
  };
  return m[c] ?? channel;
}

function playbackClientEventRu(eventClass: string): string {
  const m: Record<string, string> = {
    hls_fatal: "плеер не смог воспроизвести HLS",
    video_error: "браузер сообщил ошибку видео",
    hls_import_failed: "не удалось загрузить HLS",
    playback_refetch_failed: "не удалось повторно запросить ссылку",
    playback_refetch_exception: "исключение при повторном запросе ссылки",
    hls_js_unsupported: "устройство не поддержало HLS.js",
  };
  return m[eventClass] ?? eventClass;
}

export function SystemHealthSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SystemHealthPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/system-health", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as SystemHealthPayload | { error?: string } | null;
      if (!response.ok || body == null || typeof body !== "object" || !("fetchedAt" in body)) {
        const errorCode = body && typeof body === "object" && "error" in body ? String(body.error) : "request_failed";
        setError(response.status === 403 ? "Нужны роль admin и режим администратора." : errorCode);
        setData(null);
        return;
      }
      setData(body as SystemHealthPayload);
    } catch {
      setError("network");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workers = computeWorkerStatus(data);
  const playbackApiDisabled = data?.videoPlayback?.playbackApiEnabled === false;
  const playbackAccordionStatus = playbackApiDisabled
    ? "playback_disabled"
    : (data?.videoPlayback?.status ?? "error");
  const videoHlsProxyAccordionStatus =
    playbackApiDisabled ? "playback_disabled" : (data?.videoHlsProxy?.status ?? "error");
  const transcodeAccordionStatus = data?.videoTranscode?.status ?? "error";
  const projection = data?.projection.snapshot;
  const queuePending = projection?.pendingCount ?? 0;
  const queueProcessing = projection?.processingCount ?? 0;
  const queueDead = projection?.deadCount ?? 0;
  const queueCancelled = projection?.cancelledCount ?? 0;
  const queueRetries = projection?.retriesOverThreshold ?? 0;
  const lastSuccess = projection?.lastSuccessAt ?? null;
  const oldestPending = projection?.oldestPendingAt ?? null;
  const queueEmpty = queuePending === 0 && queueProcessing === 0;
  const openOperatorIncidents = data?.operatorIncidentsOpen ?? [];
  const backupJobEntries = Object.entries(data?.backupJobs ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Здоровье системы</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Обновить
            </Button>
          </div>
          <CardDescription>Косвенные сигналы о состоянии сервисов. Раскройте карточку для деталей и блока технической диагностики.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {error ? <p className="text-destructive">Не удалось загрузить данные ({error}).</p> : null}
          {loading ? <p className="text-muted-foreground">Загрузка…</p> : null}
          {!loading && !error && (
            <p className="text-muted-foreground">Снимок на: {formatDateTime(data?.fetchedAt)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сервисы и системные карточки</CardTitle>
          <CardDescription>Развёрнутые карточки: сначала смысл для оператора, ниже — техническая диагностика.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Платформа и API</p>
            <HealthAccordionItem name="База данных веб-приложения" status={data?.webappDb ?? "down"}>
              <DetailRow
                label="Итог"
                value={data?.webappDb === "up" ? "Подключение к базе в норме" : "База недоступна по проверке"}
              />
              <DetailRow label="Смысл" value="Если недоступна — приложение не сможет обслуживать запросы к данным." />
              <ProbeInfo probe={data?.meta?.probes?.webappDb} />
            </HealthAccordionItem>

            <HealthAccordionItem name="Сервер интеграций" status={data?.integratorApi.status ?? "error"}>
              <DetailRow
                label="Итог"
                value={data?.integratorApi.status === "ok" ? "Сервис отвечает" : "Сервис не отвечает или ошибка"}
              />
              <DetailRow
                label="Смысл"
                value="Интеграции и фоновые сценарии, завязанные на API, могут быть затронуты."
              />
              <DetailRow
                label="БД на стороне интегратора"
                value={data?.integratorApi.db == null ? "нет данных" : techProbeStatusHuman(data.integratorApi.db)}
              />
              <ProbeInfo probe={data?.meta?.probes?.integratorApi} />
            </HealthAccordionItem>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Очереди и воркеры</p>
            <HealthAccordionItem name="Синхронизация событий" status={data?.projection.status ?? "error"}>
              <DetailRow
                label="Итог"
                value={
                  data?.projection.status === "ok"
                    ? "Очередь в норме"
                    : data?.projection.status === "degraded"
                      ? "Есть отложенные или проблемные записи"
                      : "Проба недоступна или ошибочна"
                }
              />
              <DetailRow
                label="Смысл"
                value="Показывает, двигается ли поток событий между интегратором и веб-приложением."
              />
              <DetailRow
                label="Ждут обработки / обрабатываются сейчас"
                value={
                  queueEmpty
                    ? "Очередь пуста"
                    : `${queuePending} / ${queueProcessing}`
                }
              />
              <DetailRow label="Ошибок без повтора (dead)" value={String(queueDead)} />
              <DetailRow label="Отменено / повторов сверх порога" value={`${queueCancelled} / ${queueRetries}`} />
              <DetailRow label="Последняя успешная обработка" value={formatDateTime(lastSuccess)} />
              <DetailRow label="Самая старая задача ждёт с" value={formatDateTime(oldestPending)} />
              <ProbeInfo probe={data?.meta?.probes?.projection} />
            </HealthAccordionItem>

            <HealthAccordionItem name="Фоновая обработка интеграций" status={workers.worker}>
              <DetailRow label="Итог" value={workerLabel(workers.worker)} />
              <DetailRow
                label="Смысл"
                value="Оценка по последнему успеху и текущей очереди outbox; не равна статусу systemd."
              />
              <DetailRow label="Последняя успешная обработка" value={formatDateTime(lastSuccess)} />
              <DetailRow
                label="Текущая очередь"
                value={queueEmpty ? "Очередь пуста" : `ждут: ${queuePending}, в работе: ${queueProcessing}`}
              />
              <DetailRow label="Порог «активен»" value="успех не старше 40 минут при непустой очереди" />
            </HealthAccordionItem>

            <HealthAccordionItem name="Сервер веб-приложения" status={workers.webapp}>
              <DetailRow label="Итог" value="Процесс webapp отвечает (косвенно)" />
              <DetailRow label="Смысл" value="Эта карточка не заменяет мониторинг инфраструктуры хоста." />
            </HealthAccordionItem>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Медиа и фоновые задачи</p>
            <HealthAccordionItem name="Фоновая обработка медиа (по расписанию)" status={data?.mediaCronWorkers.status ?? "not_configured"}>
              <DetailRow
                label="Итог"
                value={
                  data?.mediaCronWorkers.status === "configured"
                    ? "Параметры для внутренних запросов по расписанию настроены"
                    : "Внутренние запросы по расписанию не готовы"
                }
              />
              <DetailRow
                label="Смысл"
                value="Проверяется только конфигурация окружения, не факт срабатывания расписания на хосте."
              />
            </HealthAccordionItem>

            <HealthAccordionItem name="Превью файлов медиатеки" status={data?.mediaPreview.status ?? "error"}>
              <DetailRow
                label="Итог"
                value={
                  data?.mediaPreview.status === "ok"
                    ? "Превью в норме"
                    : "Есть ошибки, пропуски или долгие ожидания"
                }
              />
              <DetailRow label="Смысл" value="Фоновая генерация миниатюр для тяжёлых форматов (MOV/HEIC/HEIF)." />
              <DetailRow label="Долгий pending" value={String(data?.mediaPreview.stalePendingCount ?? 0)} />
              {(Object.keys(PREVIEW_MIME_LABEL) as PreviewMime[]).map((mime) => {
                const counters = data?.mediaPreview.byMimeAndStatus?.[mime];
                return (
                  <div key={mime} className="rounded border border-border/50 p-2">
                    <p className="mb-1 font-medium text-foreground">{PREVIEW_MIME_LABEL[mime]}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {(Object.keys(PREVIEW_STATUS_LABEL) as PreviewStatus[]).map((status) => (
                        <DetailRow key={`${mime}-${status}`} label={PREVIEW_STATUS_LABEL[status]} value={counters?.[status] ?? 0} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <ProbeInfo probe={data?.meta?.probes?.mediaPreview} />
            </HealthAccordionItem>

            <HealthAccordionItem name="Видеоплеер у пациентов" status={playbackAccordionStatus}>
              <DetailRow
                label="Итог"
                value={
                  playbackApiDisabled
                    ? "Счётчики выдачи выключены настройкой"
                    : "Сводка по выдаче ссылок на видео в кабинете"
                }
              />
              <DetailRow
                label="Смысл"
                value={`Окно ${data?.videoPlayback?.windowHours ?? 24} ч — UTC.`}
              />
              <DetailRow
                label="API выдачи ссылок на видео"
                value={playbackApiDisabled ? "выключен" : "включён"}
              />
              {playbackApiDisabled ? (
                <DetailRow
                  label="Действие"
                  value="Включите API выдачи ссылок на видео в параметрах приложения, если нужны эти счётчики."
                />
              ) : (
                <>
                  <DetailRow label="Выдано ссылок на видео (за окно)" value={String(data?.videoPlayback?.totalResolutions ?? 0)} />
                  <DetailRow
                    label="Формат выдачи за окно: HLS / MP4 / файл"
                    value={`${data?.videoPlayback?.byDelivery.hls ?? 0} / ${data?.videoPlayback?.byDelivery.mp4 ?? 0} / ${data?.videoPlayback?.byDelivery.file ?? 0}`}
                  />
                  <DetailRow
                    label="За последний час (UTC)"
                    value={`${data?.videoPlayback?.totalResolutionsLast1h ?? 0} всего · HLS ${data?.videoPlayback?.byDeliveryLast1h?.hls ?? 0} / MP4 ${data?.videoPlayback?.byDeliveryLast1h?.mp4 ?? 0} / файл ${data?.videoPlayback?.byDeliveryLast1h?.file ?? 0}`}
                  />
                  <DetailRow
                    label="Переходов на запасной вариант"
                    value={String(data?.videoPlayback?.fallbackTotal ?? 0)}
                  />
                  <DetailRow
                    label="Переходов на запасной вариант (1 ч UTC)"
                    value={String(data?.videoPlayback?.fallbackTotalLast1h ?? 0)}
                  />
                  <DetailRow
                    label="Уникальных пациент+видео (первое событие в окне)"
                    value={String(data?.videoPlayback?.uniquePlaybackPairsFirstSeenInWindow ?? 0)}
                  />
                </>
              )}
              <ProbeInfo probe={data?.meta?.probes?.videoPlayback} />

              <div className="mt-2 rounded border border-border/50 p-2">
                <p className="mb-1 font-medium text-foreground">Ошибки плеера на устройствах пациентов</p>
                <DetailRow
                  label="Итог"
                  value={
                    data?.videoPlaybackClient?.status === "ok"
                      ? "За последний час UTC — без зафиксированных ошибок"
                      : data?.videoPlaybackClient?.status === "degraded"
                        ? "За последний час UTC есть ошибки"
                        : "Диагностика недоступна"
                  }
                />
                <DetailRow label="Всего за 24 ч" value={String(data?.videoPlaybackClient?.totalErrors ?? 0)} />
                <DetailRow label="За 1 ч UTC" value={String(data?.videoPlaybackClient?.totalErrorsLast1h ?? 0)} />
                <DetailRow
                  label="В ошибках: HLS / MP4 / файл"
                  value={`${data?.videoPlaybackClient?.byDelivery.hls ?? 0} / ${data?.videoPlaybackClient?.byDelivery.mp4 ?? 0} / ${data?.videoPlaybackClient?.byDelivery.file ?? 0}`}
                />
                <DetailRow
                  label="Повторяющийся сбой HLS по одному видео (текущий UTC-час)"
                  value={data?.videoPlaybackClient?.likelyLooping ? "да" : "нет"}
                />
                <TechDiagBlock>
                  <p className="text-[11px] text-muted-foreground">Числа по ключам телеметрии сервера</p>
                  <DetailRow label="Тяжёлая ошибка HLS / видео / импорт HLS" value={`${data?.videoPlaybackClient?.byEvent.hls_fatal ?? 0} / ${data?.videoPlaybackClient?.byEvent.video_error ?? 0} / ${data?.videoPlaybackClient?.byEvent.hls_import_failed ?? 0}`} />
                  <DetailRow label="Повторный запрос ссылки / исключение / HLS.js" value={`${data?.videoPlaybackClient?.byEvent.playback_refetch_failed ?? 0} / ${data?.videoPlaybackClient?.byEvent.playback_refetch_exception ?? 0} / ${data?.videoPlaybackClient?.byEvent.hls_js_unsupported ?? 0}`} />
                  <ProbeInfo probe={data?.meta?.probes?.videoPlaybackClient} bare />
                </TechDiagBlock>
                {data?.videoPlaybackClient?.recent?.length ? (
                  <div className="mt-2 space-y-1">
                    <p className="font-medium text-foreground">Последние события</p>
                    {data.videoPlaybackClient.recent.map((row, idx) => (
                      <div key={`${row.createdAt}-${row.mediaId}-${idx}`} className="rounded border border-border/50 p-2 font-mono text-[11px] leading-snug">
                        <DetailRow label="Время" value={formatDateTime(row.createdAt)} />
                        <DetailRow label="Видео" value={row.mediaId} />
                        <DetailRow label="Тип" value={playbackClientEventRu(row.eventClass)} />
                        <DetailRow label="Формат выдачи" value={row.delivery ?? "—"} />
                        <DetailRow label="Детали" value={row.errorDetail ?? "—"} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </HealthAccordionItem>

            <HealthAccordionItem name="Потоковая выдача HLS (прокси)" status={videoHlsProxyAccordionStatus}>
              <DetailRow label="Итог" value={playbackApiDisabled ? "Нет данных (API выдачи видео выкл.)" : "Ошибки ответов прокси из БД"} />
              {!playbackApiDisabled ? (
                <DetailRow label="Смысл" value={`Окно ${data?.videoHlsProxy?.windowHours ?? 24} ч.`} />
              ) : null}
              {playbackApiDisabled ? null : (
                <>
                  <DetailRow label="Ошибок за 24 ч" value={String(data?.videoHlsProxy?.errorsTotal24h ?? 0)} />
                  <DetailRow label="Ошибок за 1 ч" value={String(data?.videoHlsProxy?.errorsTotal1h ?? 0)} />
                  <DetailRow label="Подозрение на перегруз/сбои" value={data?.videoHlsProxy?.degraded ? "да" : "нет"} />
                  <ProbeInfo probe={data?.meta?.probes?.videoHlsProxy} />
                  {data?.videoHlsProxy?.recent?.length ? (
                    <div className="mt-2 space-y-1">
                      <p className="font-medium text-foreground">Последние записи</p>
                      {data.videoHlsProxy.recent.map((row, idx) => (
                        <div key={`${row.createdAt}-${row.mediaId}-${idx}`} className="rounded border border-border/50 p-2 font-mono text-[11px] leading-snug">
                          <DetailRow label="Время" value={formatDateTime(row.createdAt)} />
                          <DetailRow label="Видео" value={row.mediaId} />
                          <DetailRow label="Причина" value={row.reasonCode} />
                          <DetailRow label="Объект" value={row.artifactKind} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </HealthAccordionItem>

            <HealthAccordionItem name="Транскод HLS и очередь" status={transcodeAccordionStatus}>
              <p className="text-xs text-muted-foreground">Счётчики задач за 1 ч и 24 ч — в UTC.</p>
              <DetailRow
                label="Итог"
                value={
                  data?.videoTranscode?.status === "error"
                    ? "Не удалось прочитать метрики"
                    : data?.videoTranscode?.status === "degraded"
                      ? "Есть признаки задержки или отдельных сбоев по данным базы приложения"
                      : "Состояние очереди и зрелости медиабиблиотеки по данным базы приложения"
                }
              />
              <DetailRow
                label="Пайплайн / сверка каталога"
                value={`${data?.videoTranscode?.pipelineEnabled ? "включён" : "выключен"} / ${data?.videoTranscode?.reconcileEnabled ? "включена" : "выключена"}`}
              />
              <DetailRow
                label="Ждут / обрабатываются сейчас"
                value={
                  (data?.videoTranscode?.pendingCount ?? 0) === 0 && (data?.videoTranscode?.processingCount ?? 0) === 0
                    ? "Очередь пуста"
                    : `${data?.videoTranscode?.pendingCount ?? 0} / ${data?.videoTranscode?.processingCount ?? 0}`
                }
              />
              <DetailRow label="Завершено / ошибки (1 ч UTC)" value={`${data?.videoTranscode?.doneLastHour ?? 0} / ${data?.videoTranscode?.failedLastHour ?? 0}`} />
              <DetailRow label="Завершено / ошибки (24 ч UTC)" value={`${data?.videoTranscode?.doneLast24h ?? 0} / ${data?.videoTranscode?.failedLast24h ?? 0}`} />
              <DetailRow label="Завершено / ошибки (всего)" value={`${data?.videoTranscode?.doneLifetime ?? 0} / ${data?.videoTranscode?.failedLifetime ?? 0}`} />
              <DetailRow
                label="Видео без потоковой версии (кандидаты сверки, до 3 ГиБ)"
                value={String(data?.videoTranscode?.legacyReconcileCandidateCountWithinSizeCap ?? 0)}
              />
              <DetailRow
                label="Готово видео с HLS master"
                value={String(data?.videoTranscode?.readableVideoReadyWithHlsCount ?? 0)}
              />
              <DetailRow
                label="Среднее время успешной задачи (1 ч UTC), мс"
                value={
                  data?.videoTranscode?.avgProcessingMsDoneLastHour == null
                    ? "—"
                    : String(data.videoTranscode.avgProcessingMsDoneLastHour)
                }
              />
              <DetailRow
                label="Дольше всего ждёт обработку, сек"
                value={
                  data?.videoTranscode?.oldestPendingAgeSeconds == null
                    ? "—"
                    : String(data.videoTranscode.oldestPendingAgeSeconds)
                }
              />
              {data?.videoTranscode?.lastReconcileTick ? (
                <div className="mt-1 rounded border border-border/50 p-2">
                  <p className="mb-1 font-medium text-foreground">Последняя сверка старых видео</p>
                  <DetailRow label="Итог" value={techProbeStatusHuman(data.videoTranscode.lastReconcileTick.lastStatus)} />
                  <DetailRow label="Завершено" value={formatDateTime(data.videoTranscode.lastReconcileTick.lastFinishedAt)} />
                  <DetailRow label="Последний успех" value={formatDateTime(data.videoTranscode.lastReconcileTick.lastSuccessAt)} />
                  <DetailRow label="Последняя ошибка" value={formatDateTime(data.videoTranscode.lastReconcileTick.lastFailureAt)} />
                  <DetailRow label="Длительность, мс" value={String(data.videoTranscode.lastReconcileTick.lastDurationMs ?? "—")} />
                  <DetailRow label="Текст ошибки" value={data.videoTranscode.lastReconcileTick.lastError ?? "—"} />
                  <TechDiagBlock>
                    <DetailRow label="Ключ задачи (БД)" value={data.videoTranscode.lastReconcileTick.jobKey} />
                    <p className="text-[11px] text-muted-foreground break-all">
                      meta: {JSON.stringify(data.videoTranscode.lastReconcileTick.metaJson)}
                    </p>
                  </TechDiagBlock>
                </div>
              ) : (
                <DetailRow label="Последняя сверка старых видео" value="ещё не было записей в статусе оператора" />
              )}
              <ProbeInfo probe={data?.meta?.probes?.videoTranscode} />
            </HealthAccordionItem>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Инфраструктурные источники</p>
            <HealthAccordionItem
              name={`Открытые инциденты (${openOperatorIncidents.length})`}
              status={data?.meta?.probes?.operatorIncidents?.status ?? "error"}
            >
              {openOperatorIncidents.length === 0 ? (
                <DetailRow label="Итог" value="открытых нет" />
              ) : (
                <DetailRow label="Итог" value={`есть открытые (${openOperatorIncidents.length})`} />
              )}
              <ProbeInfo probe={data?.meta?.probes?.operatorIncidents} />
              {openOperatorIncidents.length === 0 ? null : (
                <div className="space-y-2">
                  {openOperatorIncidents.map((row) => (
                    <div key={row.id} className="rounded border border-border/50 p-2 text-[11px] leading-snug">
                      <DetailRow label="Интеграция" value={operatorIncidentIntegrationHuman(row.integration)} />
                      <DetailRow label="Тип ошибки" value={operatorIncidentSynopsisHuman(row.errorClass)} />
                      <DetailRow label="Направление" value={operatorIncidentDirectionHuman(row.direction)} />
                      <DetailRow label="Повторов зафиксировано" value={String(row.occurrenceCount)} />
                      <DetailRow label="Последнее срабатывание" value={formatDateTime(row.lastSeenAt)} />
                      {row.errorDetail ? <p className="mt-2 break-all text-muted-foreground">{row.errorDetail}</p> : null}
                      <TechDiagBlock>
                        <DetailRow label="Код интеграции (БД)" value={row.integration} />
                        <DetailRow label="Класс ошибки (БД)" value={row.errorClass} />
                        <DetailRow label="dedup_key" value={row.dedupKey} />
                      </TechDiagBlock>
                    </div>
                  ))}
                </div>
              )}
            </HealthAccordionItem>

            <HealthAccordionItem name="Бэкапы базы данных" status={data?.meta?.probes?.operatorBackupJobs?.status ?? "error"}>
              <DetailRow label="Итог" value={backupJobEntries.length === 0 ? "нет строк статуса" : "есть записи о прогонах"} />
              <ProbeInfo probe={data?.meta?.probes?.operatorBackupJobs} />
              {backupJobEntries.length === 0 ? (
                <DetailRow label="Подробнее" value="нет" />
              ) : (
                <div className="space-y-2">
                  {backupJobEntries.map(([jobKey, st]) => (
                    <div key={jobKey} className="rounded border border-border/50 p-2 font-mono text-[11px] leading-snug">
                      <DetailRow label="Ключ задачи (БД)" value={jobKey} />
                      <DetailRow label="Статус" value={techProbeStatusHuman(st.lastStatus)} />
                      <DetailRow label="Последний успешный прогон" value={formatDateTime(st.lastSuccessAt)} />
                      <DetailRow label="Последняя ошибка" value={formatDateTime(st.lastFailureAt)} />
                      <DetailRow label="Текст ошибки" value={st.lastError ?? "—"} />
                    </div>
                  ))}
                </div>
              )}
            </HealthAccordionItem>

            <HealthAccordionItem
              name="Очередь доставки уведомлений"
              status={data?.meta?.probes?.outgoingDelivery?.status ?? "error"}
            >
              <DetailRow label="Итог" value="Состояние исходящей очереди интегратора" />
              <ProbeInfo probe={data?.meta?.probes?.outgoingDelivery} />
              <DetailRow label="Ждут отправки" value={String(data?.outgoingDelivery?.dueBacklog ?? 0)} />
              <DetailRow label="Ошибок без повтора (dead)" value={String(data?.outgoingDelivery?.deadTotal ?? 0)} />
              <DetailRow label="Обрабатываются сейчас" value={String(data?.outgoingDelivery?.processingCount ?? 0)} />
              <DetailRow
                label="Ждущие по каналам"
                value={
                  data?.outgoingDelivery?.dueByChannel &&
                  Object.keys(data.outgoingDelivery.dueByChannel).length > 0
                    ? Object.entries(data.outgoingDelivery.dueByChannel)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([ch, n]) => `${outgoingDeliveryChannelHuman(ch)}: ${n}`)
                        .join(", ")
                    : "—"
                }
              />
              <DetailRow label="Последнее время отправки" value={formatDateTime(data?.outgoingDelivery?.lastSentAt ?? null)} />
              <DetailRow
                label="Последнее изменение записи в очереди"
                value={formatDateTime(data?.outgoingDelivery?.lastQueueActivityAt ?? null)}
              />
              <DetailRow
                label="Дольше всего ждёт (с)"
                value={
                  data?.outgoingDelivery?.oldestDueAgeSeconds == null
                    ? "—"
                    : String(data.outgoingDelivery.oldestDueAgeSeconds)
                }
              />
            </HealthAccordionItem>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Краткая сводка</CardTitle>
          <CardDescription>Сводка работы очередей и интеграций по данным этого экрана.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Сервер интеграций</span>
            <StatusPill status={workers.api} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Фон обработки интеграций</span>
            <StatusPill status={workers.worker} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Сервер веб-приложения</span>
            <StatusPill status={workers.webapp} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
