"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { apiJson } from "@/shared/lib/apiJson";

type Row = {
  id: string;
  startAt: string;
  phoneNormalized: string | null;
  attribution: Record<string, unknown>;
  createdAt: string;
};

const BASE = "/api/admin/booking-engine/public-appointments";

function formatAttribution(attr: Record<string, unknown>): string {
  const keys = [
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "trafficSource",
    "presetCityCode",
    "embedMode",
  ] as const;
  const parts: string[] = [];
  for (const k of keys) {
    const v = attr[k];
    if (typeof v === "string" && v.trim()) parts.push(`${k}=${v}`);
  }
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(attr);
}

export function BookingPublicAttributionSection() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiJson<{ ok: boolean; items?: Row[] }>(`${BASE}?limit=20`, { cache: "no-store" });
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Источники публичных записей</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Обновить
        </Button>
      </div>
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Загрузка…</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Нет записей с атрибуцией.</p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {items.map((row) => (
          <li key={row.id} className="rounded border px-3 py-2">
            <p className="font-mono text-xs text-muted-foreground">{row.startAt}</p>
            <p>{formatAttribution(row.attribution)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
