"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/shared/lib/apiJson";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
  HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS,
  type HealthFailureArchiveProbe,
} from "@/modules/operator-health/healthFailureArchiveConstants";

type ArchiveItem = {
  id: string;
  archivedAt: string;
  healthProbe: string;
  sourceKind: string;
  sourceId: string;
  summaryJson: Record<string, unknown>;
  rawErrorTruncated: string | null;
};

/** Тип строки в таблице: queue_kind для outgoing, event_type для projection. */
export function archiveRowTypeLabel(summary: Record<string, unknown>): string {
  const queueKind = summary.queue_kind;
  if (typeof queueKind === "string" && queueKind.length > 0) return queueKind;
  const eventType = summary.event_type;
  if (typeof eventType === "string" && eventType.length > 0) return eventType;
  return "—";
}

/** Причина: reason_ru для outgoing, иначе усечённая ошибка из архива. */
export function archiveRowReasonLabel(row: Pick<ArchiveItem, "summaryJson" | "rawErrorTruncated">): string {
  const reason = row.summaryJson.reason_ru;
  if (typeof reason === "string" && reason.length > 0) return reason;
  if (row.rawErrorTruncated != null && row.rawErrorTruncated.length > 0) return row.rawErrorTruncated;
  return "—";
}

export type HealthFailureArchiveSectionProps = {
  initialProbe?: HealthFailureArchiveProbe | "all";
};

export function HealthFailureArchiveSection({ initialProbe = "all" }: HealthFailureArchiveSectionProps) {
  const [probe, setProbe] = useState<HealthFailureArchiveProbe | "all">(initialProbe);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProbe(initialProbe);
  }, [initialProbe]);

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      const busy = append ? setLoadingMore : setLoading;
      busy(true);
      if (!append) setError(null);
      try {
        const qs = new URLSearchParams();
        if (probe !== "all") qs.set("probe", probe);
        if (cursor) qs.set("cursor", cursor);
        qs.set("limit", "50");
        const body = await apiJson<{ ok: boolean; items: ArchiveItem[]; nextCursor?: string | null }>(
          `/api/admin/health-failure-archive?${qs.toString()}`,
          { credentials: "include", cache: "no-store" },
        );
        setItems((prev) => (append ? [...prev, ...body.items] : body.items));
        setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "network");
        if (!append) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        busy(false);
      }
    },
    [probe],
  );

  useEffect(() => {
    void loadPage(null, false);
  }, [loadPage]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Архив сбоев очередей</CardTitle>
        <CardDescription>
          Записи dead после ручной очистки. Хранение до {HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS} дней. Счётчики
          «Журнал рассылок» в архиве не меняются.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted-foreground">
            <span className="mr-2">Проба</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={probe}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") setProbe("all");
                else if (v === HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE) setProbe(HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE);
                else if (v === HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE) {
                  setProbe(HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE);
                } else if (v === HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE) {
                  setProbe(HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE);
                } else if (v === HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE) {
                  setProbe(HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE);
                }
              }}
            >
              <option value="all">Все</option>
              <option value={HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE}>Очередь доставки</option>
              <option value={HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE}>Синк в integrator</option>
              <option value={HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE}>Синхронизация событий</option>
              <option value={HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE}>Напоминания (reminder_dispatch)</option>
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPage(null, false)} disabled={loading}>
            Обновить
          </Button>
          <Link href="/app/doctor/system-health" className="text-xs text-muted-foreground underline underline-offset-2">
            К здоровью системы
          </Link>
        </div>

        {error ? <p className="text-destructive">Не удалось загрузить архив ({error}).</p> : null}
        {loading ? <p className="text-muted-foreground">Загрузка…</p> : null}

        {!loading && !error && items.length === 0 ? (
          <p className="text-muted-foreground">Записей нет.</p>
        ) : null}

        {items.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-border/60 bg-muted/40">
                <tr>
                  <th className="p-2 font-medium">Когда</th>
                  <th className="p-2 font-medium">Проба</th>
                  <th className="p-2 font-medium">Тип</th>
                  <th className="p-2 font-medium">Причина</th>
                  <th className="p-2 font-medium">Источник</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 align-top">
                    <td className="p-2 whitespace-nowrap text-muted-foreground">{row.archivedAt.replace("T", " ").slice(0, 19)}</td>
                    <td className="p-2">{row.healthProbe}</td>
                    <td className="p-2">{archiveRowTypeLabel(row.summaryJson)}</td>
                    <td className="p-2">{archiveRowReasonLabel(row)}</td>
                    <td className="p-2 font-mono break-all">{row.sourceId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {items.length > 0 && rowHasBroadcastNotes(items) ? (
          <p className="text-[11px] text-muted-foreground">
            Для рассылок: счётчики sent/error в журнале рассылки на момент отправки не пересчитываются при архивации.
          </p>
        ) : null}

        {nextCursor ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadPage(nextCursor, true)}
          >
            {loadingMore ? "Загрузка…" : "Ещё"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function rowHasBroadcastNotes(items: ArchiveItem[]): boolean {
  return items.some(
    (r) =>
      r.summaryJson &&
      typeof r.summaryJson.broadcast_audit_id === "string" &&
      r.summaryJson.broadcast_audit_id.length > 0,
  );
}
