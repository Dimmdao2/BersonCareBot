"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/doctor/primitives/dialog";
import type {
  DoctorAnalyticsMetricAccountItem,
  DoctorAnalyticsMetricKey,
} from "@/modules/doctor-analytics-metric-accounts/ports";
import type { AnalyticsPeriodValue } from "@/app/app/doctor/analytics/clients/analyticsPeriodUi";
import { buildAdminStatsQuery } from "@/app/app/doctor/analytics/clients/analyticsPeriodUi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric: DoctorAnalyticsMetricKey | null;
  title: string;
  /** Omit for doctor today / window-only APIs. */
  period?: AnalyticsPeriodValue;
  /** Default: admin metric-accounts route. */
  apiPath?: string;
  extraQuery?: Record<string, string>;
};

const PAGE_SIZE = 30;

function formatEventAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { hour12: false });
}

const DEFAULT_API_PATH = "/api/admin/doctor-analytics-metric-accounts";

export function MetricAccountsDialog({
  open,
  onOpenChange,
  metric,
  title,
  period,
  apiPath = DEFAULT_API_PATH,
  extraQuery,
}: Props) {
  const [items, setItems] = useState<DoctorAnalyticsMetricAccountItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const queryBase = useMemo(
    () => (period ? buildAdminStatsQuery(period) : new URLSearchParams()),
    [period],
  );

  const loadPage = useCallback(
    async (nextOffset: number, replace: boolean) => {
      if (!metric) return;
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams(queryBase);
        q.set("metric", metric);
        q.set("limit", String(PAGE_SIZE));
        q.set("offset", String(nextOffset));
        if (extraQuery) {
          for (const [k, v] of Object.entries(extraQuery)) q.set(k, v);
        }
        const res = await fetch(`${apiPath}?${q.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          items?: DoctorAnalyticsMetricAccountItem[];
          hasMore?: boolean;
          nextOffset?: number | null;
        };
        if (!res.ok || !json.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        const pageItems = json.items ?? [];
        setItems((prev) => (replace ? pageItems : [...prev, ...pageItems]));
        setHasMore(Boolean(json.hasMore));
        setOffset(json.nextOffset ?? nextOffset + pageItems.length);
      } catch {
        setError("network");
      } finally {
        setLoading(false);
      }
    },
    [metric, queryBase, apiPath, extraQuery],
  );

  useEffect(() => {
    if (!open || !metric) return;
    setItems([]);
    setOffset(0);
    setHasMore(false);
    void loadPage(0, true);
  }, [open, metric, loadPage]);

  useEffect(() => {
    if (!open || !metric || !hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          void loadPage(offset, false);
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, metric, hasMore, loading, offset, loadPage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!error && items.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">Нет данных по метрике.</p>
          ) : null}
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <li key={`${item.userId}-${item.eventAt ?? "none"}-${idx}`} className="rounded-md border border-border/60 p-2">
                <Link
                  href={`/app/doctor/clients/${item.userId}`}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  {item.displayName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {item.phone ? `Телефон: ${item.phone}` : "Телефон не указан"}
                  {item.eventLabel ? ` · ${item.eventLabel}` : ""}
                  {item.eventAt ? ` · ${formatEventAt(item.eventAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <div ref={sentinelRef} className="h-3 w-full" />
          {loading ? <p className="pt-2 text-xs text-muted-foreground">Загрузка…</p> : null}
          {!hasMore && items.length > 0 ? (
            <p className="pt-2 text-xs text-muted-foreground">Конец списка.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
