"use client";

import { useCallback, useEffect, useState } from "react";
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
  fetchedAt: string;
};

function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "ok" || status === "up" || status === "running" || status === "active") return "secondary";
  if (status === "degraded" || status === "no_signal" || status === "no_source" || status === "no_activity") {
    return "outline";
  }
  return "destructive";
}

function statusDotClass(status: string): string {
  if (status === "ok" || status === "up" || status === "running" || status === "active") return "bg-emerald-500";
  if (status === "degraded" || status === "no_signal" || status === "no_source" || status === "no_activity") {
    return "bg-amber-500";
  }
  if (status === "configured") return "bg-blue-500";
  if (status === "not_configured") return "bg-zinc-400";
  return "bg-rose-500";
}

function statusLabel(status: string): string {
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

function computeWorkerStatus(
  payload: SystemHealthPayload | null,
): {
  api: "active" | "down" | "unknown";
  worker: "active" | "no_activity" | "no_signal";
  webapp: "running";
} {
  if (!payload) {
    return { api: "unknown", worker: "no_signal", webapp: "running" };
  }

  const api = payload.integratorApi.status === "ok" ? "active" : "down";
  const lastSuccessAt = payload.projection.snapshot?.lastSuccessAt;
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

function workerLabel(status: "active" | "no_activity" | "no_signal" | "down" | "unknown" | "running"): string {
  if (status === "active") return "активен";
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

type WorkerItemProps = {
  name: string;
  status: string;
  description: string;
};

function WorkerAccordionItem({ name, status, description }: WorkerItemProps) {
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
          <p>{description}</p>
          <p>Ошибки: будет добавлено позже.</p>
          <p>Расписание: будет добавлено позже.</p>
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
          <CardTitle className="text-base">Сервисы и БД</CardTitle>
          <CardDescription>Доступность webapp БД, integrator API и проекции очереди.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>bersoncarebot-webapp-prod DB</span>
            <StatusPill status={data?.webappDb ?? "down"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>bersoncarebot-api-prod /health</span>
            <div className="flex items-center gap-2">
              <StatusPill status={data?.integratorApi.status ?? "error"} />
              {data?.integratorApi.db ? (
                <Badge variant={statusBadgeVariant(data.integratorApi.db)} className="inline-flex items-center gap-1.5">
                  <span className={cn("inline-block h-2 w-2 rounded-full", statusDotClass(data.integratorApi.db))} />
                  db: {data.integratorApi.db}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>projection_outbox</span>
            <StatusPill status={data?.projection.status ?? "error"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Превью медиа (MOV/HEIC)</CardTitle>
          <CardDescription>Агрегация по `media_files.preview_status` для quicktime/heic/heif.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Общий статус preview-pipeline</span>
            <StatusPill status={data?.mediaPreview.status ?? "error"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
            <span>Зависшие pending &gt; 30 минут</span>
            <Badge variant={(data?.mediaPreview.stalePendingCount ?? 0) > 0 ? "destructive" : "secondary"}>
              {data?.mediaPreview.stalePendingCount ?? 0}
            </Badge>
          </div>
          {(Object.keys(PREVIEW_MIME_LABEL) as PreviewMime[]).map((mime) => {
            const counters = data?.mediaPreview.byMimeAndStatus?.[mime];
            return (
              <div key={mime} className="space-y-2 rounded-md border border-border/60 p-3">
                <p className="font-medium">{PREVIEW_MIME_LABEL[mime]}</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PREVIEW_STATUS_LABEL) as PreviewStatus[]).map((status) => (
                    <Badge
                      key={`${mime}-${status}`}
                      variant={status === "failed" && (counters?.[status] ?? 0) > 0 ? "destructive" : "outline"}
                    >
                      {PREVIEW_STATUS_LABEL[status]}: {counters?.[status] ?? 0}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Воркеры (косвенно)</CardTitle>
          <CardDescription>
            Статусы вычисляются по интеграционным health-сигналам: API по `/health`, worker по
            `projection.lastSuccessAt`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <WorkerAccordionItem
            name="bersoncarebot-api-prod"
            status={workers.api}
            description="Integrator API process. Косвенный статус берется из ответа /health."
          />
          <WorkerAccordionItem
            name="bersoncarebot-worker-prod"
            status={workers.worker}
            description="Фоновый worker обработки очередей. Косвенный статус строится по projection.lastSuccessAt."
          />
          <WorkerAccordionItem
            name="bersoncarebot-webapp-prod"
            status={workers.webapp}
            description="Next.js webapp process. Вариант 1 показывает статический runtime-статус running."
          />
          <WorkerAccordionItem
            name="media cron workers"
            status={data?.mediaCronWorkers.status ?? "not_configured"}
            description="Cron-задачи purge / multipart cleanup / preview-process. Статус показывает, настроена ли конфигурация для запуска."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Журнал бэкапов</CardTitle>
          <CardDescription>Источник статуса бэкапов в webapp пока не подключен.</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">источник не подключен</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
