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
  meta?: {
    probes?: {
      webappDb?: { status: string; durationMs: number; errorCode?: string };
      integratorApi?: { status: string; durationMs: number; errorCode?: string };
      projection?: { status: string; durationMs: number; errorCode?: string };
      mediaPreview?: { status: string; durationMs: number; errorCode?: string };
    };
  };
  fetchedAt: string;
};

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "ok" || status === "up" || status === "running" || status === "active" || status === "idle") {
    return "secondary";
  }
  if (status === "degraded" || status === "no_signal" || status === "no_source" || status === "no_activity") {
    return "outline";
  }
  return "destructive";
}

function statusDotClass(status: string): string {
  if (status === "ok" || status === "up" || status === "running" || status === "active") return "bg-emerald-500";
  if (status === "idle") return "bg-sky-500";
  if (status === "degraded" || status === "no_signal" || status === "no_source" || status === "no_activity") {
    return "bg-amber-500";
  }
  if (status === "configured") return "bg-blue-500";
  if (status === "not_configured") return "bg-zinc-400";
  return "bg-rose-500";
}

function statusLabel(status: string): string {
  if (status === "idle") return "idle";
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
          <HealthAccordionItem name="bersoncarebot-webapp-prod DB" status={data?.webappDb ?? "down"}>
            <DetailRow label="Состояние" value={data?.webappDb === "up" ? "База webapp доступна" : "База webapp недоступна"} />
            <DetailRow label="Диагностика" value={data?.webappDb === "up" ? "Проверка DB OK" : "Проверка DB неуспешна"} />
            <ProbeInfo probe={data?.meta?.probes?.webappDb} />
          </HealthAccordionItem>

          <HealthAccordionItem name="bersoncarebot-api-prod /health" status={data?.integratorApi.status ?? "error"}>
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

          <HealthAccordionItem name="projection_outbox" status={data?.projection.status ?? "error"}>
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
              value={
                data?.projection.status === "ok"
                  ? `deadCount=${queueDead}, retriesOverThreshold=${queueRetries}`
                  : `deadCount=${queueDead}, retriesOverThreshold=${queueRetries}`
              }
            />
            <ProbeInfo probe={data?.meta?.probes?.projection} />
          </HealthAccordionItem>

          <HealthAccordionItem name="bersoncarebot-worker-prod" status={workers.worker}>
            <DetailRow
              label="Состояние"
              value={workerLabel(workers.worker)}
            />
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

          <HealthAccordionItem name="bersoncarebot-webapp-prod" status={workers.webapp}>
            <DetailRow label="Состояние" value="runtime status: running (вариант 1)" />
            <DetailRow label="Источник сигнала" value="Статический runtime-маркер в UI" />
          </HealthAccordionItem>

          <HealthAccordionItem name="media cron workers" status={data?.mediaCronWorkers.status ?? "not_configured"}>
            <DetailRow
              label="Состояние"
              value={data?.mediaCronWorkers.status === "configured" ? "Конфигурация cron присутствует" : "Конфигурация cron отсутствует"}
            />
            <DetailRow label="Источник сигнала" value="Проверка env INTERNAL_JOB_SECRET + S3 media config" />
            <DetailRow label="Ограничение" value="Нет прямой telemetry о фактическом runtime cron-процессов" />
          </HealthAccordionItem>

          <HealthAccordionItem name="preview-pipeline (MOV/HEIC/HEIF)" status={data?.mediaPreview.status ?? "error"}>
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

          <HealthAccordionItem name="backup journal" status="no_source">
            <DetailRow label="Источник" value="не подключен" />
            <DetailRow label="Статус" value="нет данных о бэкапах" />
            <DetailRow label="Ограничение" value="В варианте 1 источник telemetry для backup journal отсутствует" />
          </HealthAccordionItem>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Краткая сводка</CardTitle>
          <CardDescription>Сигналы состояния воркеров на основе health и projection snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>bersoncarebot-api-prod</span>
            <StatusPill status={workers.api} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>bersoncarebot-worker-prod</span>
            <StatusPill status={workers.worker} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>bersoncarebot-webapp-prod</span>
            <StatusPill status={workers.webapp} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
