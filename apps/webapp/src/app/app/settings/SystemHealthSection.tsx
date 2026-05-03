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
  /** VIDEO_HLS_DELIVERY: hourly playback aggregates (UTC), rolling window. */
  videoPlayback: {
    status: "ok" | "error";
    windowHours: number;
    playbackApiEnabled: boolean;
    byDelivery: { hls: number; mp4: number; file: number };
    fallbackTotal: number;
    totalResolutions: number;
    /** Первая фиксация пары пользователь+видео за rolling window см. админ-док `/api/admin/system-health`. */
    uniquePlaybackPairsFirstSeenInWindow: number;
  };
  meta?: {
    probes?: {
      webappDb?: { status: string; durationMs: number; errorCode?: string };
      integratorApi?: { status: string; durationMs: number; errorCode?: string };
      projection?: { status: string; durationMs: number; errorCode?: string };
      mediaPreview?: { status: string; durationMs: number; errorCode?: string };
      videoPlayback?: { status: string; durationMs: number; errorCode?: string };
    };
  };
  fetchedAt: string;
};

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
  if (status === "idle") return "idle";
  if (status === "playback_disabled") return "API выкл.";
  if (status === "configured") return "сконфигурированы";
  if (status === "not_configured") return "не настроены";
  return status;
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
  if (status === "idle") return "idle";
  if (status === "no_activity") return "нет активности";
  if (status === "no_signal") return "нет сигнала";
  if (status === "down") return "недоступен";
  if (status === "running") return "running";
  return "неизвестно";
}

const PREVIEW_MIME_LABEL: Record<PreviewMime, string> = {
  "video/quicktime": "MOV (video/quicktime)",
  "image/heic": "HEIC (image/heic)",
  "image/heif": "HEIF (image/heif)",
};

const PREVIEW_STATUS_LABEL: Record<PreviewStatus, string> = {
  ready: "ready",
  pending: "pending",
  failed: "failed",
  skipped: "skipped",
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

function ProbeInfo({ probe }: { probe?: { status: string; durationMs: number; errorCode?: string } }) {
  if (!probe) return <p className="text-muted-foreground">Тех. контекст: нет данных</p>;
  return (
    <div className="space-y-1">
      <DetailRow label="Probe status" value={probe.status} />
      <DetailRow label="Duration" value={`${probe.durationMs} ms`} />
      <DetailRow label="Error code" value={probe.errorCode ?? "—"} />
    </div>
  );
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
  const projection = data?.projection.snapshot;
  const queuePending = projection?.pendingCount ?? 0;
  const queueProcessing = projection?.processingCount ?? 0;
  const queueDead = projection?.deadCount ?? 0;
  const queueCancelled = projection?.cancelledCount ?? 0;
  const queueRetries = projection?.retriesOverThreshold ?? 0;
  const lastSuccess = projection?.lastSuccessAt ?? null;
  const oldestPending = projection?.oldestPendingAt ?? null;
  const queueEmpty = queuePending === 0 && queueProcessing === 0;

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
          <CardDescription>
            Вариант 1: используются косвенные сигналы из health endpoint-ов и projection snapshot, без прямого
            process/systemd telemetry.
          </CardDescription>
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
          <CardDescription>Каждая карточка раскрывается отдельно и показывает доступную диагностику.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Платформа и API</p>
            <HealthAccordionItem name="База webapp (bersoncarebot-webapp-prod DB)" status={data?.webappDb ?? "down"}>
              <DetailRow label="Состояние" value={data?.webappDb === "up" ? "База webapp доступна" : "База webapp недоступна"} />
              <DetailRow label="Диагностика" value={data?.webappDb === "up" ? "Проверка DB OK" : "Проверка DB неуспешна"} />
              <ProbeInfo probe={data?.meta?.probes?.webappDb} />
            </HealthAccordionItem>

            <HealthAccordionItem name="API integrator (/health) (bersoncarebot-api-prod)" status={data?.integratorApi.status ?? "error"}>
              <DetailRow
                label="Состояние"
                value={data?.integratorApi.status === "ok" ? "Integrator API доступен" : "Integrator API недоступен"}
              />
              <DetailRow label="DB integrator" value={data?.integratorApi.db ?? "нет данных"} />
              <DetailRow
                label="Диагностика"
                value={data?.integratorApi.status === "ok" ? "Ответ /health получен" : "Проба /health завершилась ошибкой"}
              />
              <ProbeInfo probe={data?.meta?.probes?.integratorApi} />
            </HealthAccordionItem>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Очереди и воркеры</p>
            <HealthAccordionItem name="Проекция outbox (projection_outbox)" status={data?.projection.status ?? "error"}>
              <DetailRow
                label="Состояние"
                value={data?.projection.status === "ok" ? "Очередь projection_outbox в норме" : "Есть признаки деградации"}
              />
              <DetailRow label="Dead / Pending / Processing" value={`${queueDead} / ${queuePending} / ${queueProcessing}`} />
              <DetailRow label="Cancelled / Retries>threshold" value={`${queueCancelled} / ${queueRetries}`} />
              <DetailRow label="Последняя активность" value={formatDateTime(lastSuccess)} />
              <DetailRow label="Oldest pending" value={formatDateTime(oldestPending)} />
              <DetailRow
                label="Почему такой статус"
                value={`deadCount=${queueDead}, retriesOverThreshold=${queueRetries}`}
              />
              <ProbeInfo probe={data?.meta?.probes?.projection} />
            </HealthAccordionItem>

            <HealthAccordionItem name="Worker runtime (bersoncarebot-worker-prod)" status={workers.worker}>
              <DetailRow label="Состояние" value={workerLabel(workers.worker)} />
              <DetailRow label="Последняя успешная обработка" value={formatDateTime(lastSuccess)} />
              <DetailRow label="Текущая очередь (pending/processing)" value={`${queuePending}/${queueProcessing}`} />
              <DetailRow
                label="Почему такой статус"
                value={
                  workers.worker === "idle"
                    ? "queue empty -> idle"
                    : workers.worker === "active"
                      ? "lastSuccessAt <= 40m"
                      : workers.worker === "no_activity"
                        ? "queue has items but no fresh success"
                        : "нет валидного сигнала lastSuccessAt"
                }
              />
              <DetailRow label="Порог активности" value="40 минут" />
            </HealthAccordionItem>

            <HealthAccordionItem name="Webapp runtime (bersoncarebot-webapp-prod)" status={workers.webapp}>
              <DetailRow label="Состояние" value="runtime status: running (вариант 1)" />
              <DetailRow label="Источник сигнала" value="Статический runtime-маркер в UI" />
            </HealthAccordionItem>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Медиа и фоновые задачи</p>
            <HealthAccordionItem name="Cron задачи медиа (media cron workers)" status={data?.mediaCronWorkers.status ?? "not_configured"}>
              <DetailRow
                label="Состояние"
                value={data?.mediaCronWorkers.status === "configured" ? "Конфигурация cron присутствует" : "Конфигурация cron отсутствует"}
              />
              <DetailRow label="Источник сигнала" value="Проверка env INTERNAL_JOB_SECRET + S3 media config" />
              <DetailRow label="Ограничение" value="Нет прямой telemetry о фактическом runtime cron-процессов" />
            </HealthAccordionItem>

            <HealthAccordionItem name="Превью медиа (preview-pipeline MOV/HEIC/HEIF)" status={data?.mediaPreview.status ?? "error"}>
              <DetailRow
                label="Состояние"
                value={data?.mediaPreview.status === "ok" ? "Очередь preview в норме" : "Есть pending/skipped/failed или stale pending"}
              />
              <DetailRow label="Stale pending > 30m" value={data?.mediaPreview.stalePendingCount ?? 0} />
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

            <HealthAccordionItem
              name="Воспроизведение видео (playback / HLS)"
              status={playbackAccordionStatus}
            >
              <DetailRow
                label="Окно"
                value={`последние ${data?.videoPlayback?.windowHours ?? 24} ч (UTC, почасовые срезы в БД)`}
              />
              <DetailRow
                label="GET /api/media/.../playback"
                value={
                  playbackApiDisabled
                    ? "выключен (`video_playback_api_enabled`, новые счётчики не ведутся)"
                    : "включён (video_playback_api_enabled)"
                }
              />
              {playbackApiDisabled ? (
                <p className="pt-1 font-medium text-foreground">
                  Показатели ниже недоступны: playback JSON API выключен.
                </p>
              ) : (
                <>
                  <DetailRow label="Всего резолвов API" value={String(data?.videoPlayback?.totalResolutions ?? 0)} />
                  <DetailRow label="Уник. пары (пользователь+видео, первый раз за всё время, событие в окне)" value={String(data?.videoPlayback?.uniquePlaybackPairsFirstSeenInWindow ?? 0)} />
                  <DetailRow
                    label="HLS / MP4 / file (резолвы)"
                    value={`${data?.videoPlayback?.byDelivery.hls ?? 0} / ${data?.videoPlayback?.byDelivery.mp4 ?? 0} / ${data?.videoPlayback?.byDelivery.file ?? 0}`}
                  />
                  <DetailRow
                    label="Fallback (сумма по строкам почасового агрегата)"
                    value={String(data?.videoPlayback?.fallbackTotal ?? 0)}
                  />
                  <p className="pt-1 text-muted-foreground">
                    «Всего резолвов» растёт на каждый успешный `resolve` (например, повторный{" "}
                    <code className="text-foreground">GET …/playback</code> перед истечением presigned URL при длинном
                    HLS). «Уник. пары» — не более одного события на пару платформенный пользователь + видеофайл за всё время
                    (первое попадание в таблице дедупликации).
                  </p>
                  <p className="pt-1 text-muted-foreground">
                    Счётчики ведутся с момента внедрения таблиц; полные журналы см. по сообщению{" "}
                    <code className="text-foreground">playback_resolved</code>.
                  </p>
                </>
              )}
              <ProbeInfo probe={data?.meta?.probes?.videoPlayback} />
            </HealthAccordionItem>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Инфраструктурные источники</p>
            <HealthAccordionItem name="Журнал бэкапов (backup journal)" status="no_source">
              <DetailRow label="Источник" value="не подключен" />
              <DetailRow label="Статус" value="нет данных о бэкапах" />
              <DetailRow label="Ограничение" value="В варианте 1 источник telemetry для backup journal отсутствует" />
            </HealthAccordionItem>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Краткая сводка</CardTitle>
          <CardDescription>Сигналы состояния воркеров на основе health и projection snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>API integrator (bersoncarebot-api-prod)</span>
            <StatusPill status={workers.api} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Worker runtime (bersoncarebot-worker-prod)</span>
            <StatusPill status={workers.worker} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Webapp runtime (bersoncarebot-webapp-prod)</span>
            <StatusPill status={workers.webapp} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
