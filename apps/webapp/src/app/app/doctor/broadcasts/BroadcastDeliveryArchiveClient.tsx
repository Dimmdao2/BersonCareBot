"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";

type Row = {
  id: string;
  archivedAt: string;
  summaryJson: Record<string, unknown>;
  rawErrorTruncated: string | null;
};

function s(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === "string" ? v : "—";
}

export function BroadcastDeliveryArchiveClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (cursor: string | null, append: boolean) => {
    const busy = append ? setLoadingMore : setLoading;
    busy(true);
    if (!append) setErr(null);
    try {
      const qs = new URLSearchParams();
      if (cursor) qs.set("cursor", cursor);
      qs.set("limit", "40");
      const res = await fetch(`/api/doctor/health-failure-archive?${qs}`, { credentials: "include", cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; items?: Row[]; nextCursor?: string | null; error?: string }
        | null;
      if (!res.ok || !body?.ok || !Array.isArray(body.items)) {
        setErr(body?.error ?? "request_failed");
        if (!append) {
          setItems([]);
          setNextCursor(null);
        }
        return;
      }
      setItems((prev) => (append ? [...prev, ...body.items!] : body.items!));
      setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
    } catch {
      setErr("network");
      if (!append) {
        setItems([]);
        setNextCursor(null);
      }
    } finally {
      busy(false);
    }
  }, []);

  useEffect(() => {
    void load(null, false);
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Ошибки доставки по вашим рассылкам.</p>

      {err ? <p className="text-sm text-destructive">Не удалось загрузить ({err}).</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}

      {!loading && !err && items.length === 0 ? <p className="text-sm text-muted-foreground">Записей нет.</p> : null}

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((row) => (
            <Card key={row.id}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">
                  {s(row.summaryJson, "broadcast_title_short")} · {s(row.summaryJson, "recipient_short_name")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pb-3 text-xs text-muted-foreground">
                <p>{s(row.summaryJson, "reason_ru")}</p>
                <p>Телефон: {s(row.summaryJson, "recipient_phone_masked")}</p>
                <p>Канал: {s(row.summaryJson, "channel")}</p>
                <p className="font-mono text-[10px] break-all opacity-80">{row.archivedAt.replace("T", " ").slice(0, 19)}</p>
                {row.rawErrorTruncated ? (
                  <p className="break-all text-[10px] opacity-70">{row.rawErrorTruncated}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {nextCursor ? (
        <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void load(nextCursor, true)}>
          {loadingMore ? "…" : "Ещё"}
        </Button>
      ) : null}

      <p className="text-xs text-muted-foreground">Счётчики журнала рассылки при архивации не меняются.</p>
    </div>
  );
}
