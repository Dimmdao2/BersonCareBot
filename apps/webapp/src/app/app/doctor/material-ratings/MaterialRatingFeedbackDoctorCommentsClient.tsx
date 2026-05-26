"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MATERIAL_RATING_FEEDBACK_REASON_LABELS,
} from "@/modules/material-rating-feedback/reasonCodes";
import type { MaterialRatingFeedbackDoctorSummary } from "@/modules/material-rating-feedback/ports";

const PAGE_SIZE = 20;

type FeedbackRow = MaterialRatingFeedbackDoctorSummary["recent"][number];

export function MaterialRatingFeedbackDoctorCommentsClient({
  contentPageId,
  initialRows,
  total,
}: {
  contentPageId: string;
  initialRows: FeedbackRow[];
  total: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [offset, setOffset] = useState(initialRows.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        contentPageId,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await fetch(`/api/doctor/material-ratings/feedback?${q.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; rows?: FeedbackRow[]; error?: string };
      if (!res.ok || !json.ok || !json.rows) {
        setError(json.error ?? "load_failed");
        return;
      }
      setRows((prev) => [...prev, ...json.rows!]);
      setOffset((prev) => prev + json.rows!.length);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [contentPageId, hasMore, loading, offset]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет комментариев.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 font-medium">Пользователь</th>
              <th className="px-3 py-2 font-medium">Звёзды</th>
              <th className="px-3 py-2 font-medium">Причины</th>
              <th className="px-3 py-2 font-medium">Комментарий</th>
              <th className="px-3 py-2 font-medium">Дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-3 py-2">{row.displayLabel}</td>
                <td className="px-3 py-2 tabular-nums">{row.ratingValue}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.reasonCodes.map((code) => MATERIAL_RATING_FEEDBACK_REASON_LABELS[code]).join(", ") ||
                    "—"}
                </td>
                <td className="max-w-xs px-3 py-2 text-muted-foreground">{row.comment?.trim() || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {hasMore ? (
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void loadMore()}>
          {loading ? "Загрузка…" : "Показать ещё"}
        </Button>
      ) : null}
    </div>
  );
}
