"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { MaterialRatingDetailPreset } from "@/modules/material-rating/detailTimeRange";
import type { MaterialRatingDoctorDetailDay, MaterialRatingDoctorDetailRater } from "@/modules/material-rating/types";

import { MaterialRatingDetailChart } from "./MaterialRatingDetailChart";

export type MaterialRatingDetailApiPayload = {
  iana: string;
  fromDay: string;
  toDay: string;
  days: MaterialRatingDoctorDetailDay[];
  raters: MaterialRatingDoctorDetailRater[];
};

function buildQuery(
  kind: string,
  id: string,
  preset: MaterialRatingDetailPreset,
  from: string,
  to: string,
): string {
  const p = new URLSearchParams();
  p.set("kind", kind);
  p.set("id", id);
  p.set("preset", preset);
  if (preset === "custom") {
    p.set("from", from);
    p.set("to", to);
  }
  return `/api/doctor/material-ratings/detail?${p.toString()}`;
}

export function MaterialRatingDetailClient({
  kind,
  id,
  calendarTodayYmd,
}: {
  kind: string;
  id: string;
  calendarTodayYmd: string;
}) {
  const [preset, setPreset] = useState<MaterialRatingDetailPreset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<MaterialRatingDetailApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery(kind, id, preset, customFrom.trim(), customTo.trim());
      const res = await fetch(q, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<MaterialRatingDetailApiPayload>;
      if (!res.ok || !json.ok) {
        setData(null);
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const { ok: _ok, ...rest } = json as { ok: true } & MaterialRatingDetailApiPayload;
      setData(rest);
    } catch {
      setData(null);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [kind, id, preset, customFrom, customTo]);

  useEffect(() => {
    if (preset === "custom" && (!customFrom.trim() || !customTo.trim())) {
      const t = calendarTodayYmd.trim() || new Date().toISOString().slice(0, 10);
      setCustomFrom(t);
      setCustomTo(t);
      return;
    }
    void load();
  }, [preset, customFrom, customTo, load, calendarTodayYmd]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={preset === "week" ? "default" : "outline"} onClick={() => setPreset("week")}>
          7 дней
        </Button>
        <Button type="button" size="sm" variant={preset === "month" ? "default" : "outline"} onClick={() => setPreset("month")}>
          30 дней
        </Button>
        <Button type="button" size="sm" variant={preset === "custom" ? "default" : "outline"} onClick={() => setPreset("custom")}>
          Период
        </Button>
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">С</span>
            <input
              className="rounded border border-input bg-background px-2 py-1"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">По</span>
            <input
              className="rounded border border-input bg-background px-2 py-1"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          <span className="text-xs text-muted-foreground">Не более 31 дня</span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}

      {data ? (
        <>
          <p className="text-sm text-muted-foreground">
            Календарь: {data.iana} · {data.fromDay} — {data.toDay}
          </p>
          <MaterialRatingDetailChart days={data.days} />
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Пользователь</th>
                  <th className="py-2 px-3 font-medium">Звёзды</th>
                  <th className="py-2 px-3 font-medium">Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {data.raters.map((r) => (
                  <tr key={`${r.userId}-${r.updatedAt}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 px-3">{r.displayLabel}</td>
                    <td className="py-2 px-3 tabular-nums">{r.stars}</td>
                    <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{r.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.raters.length === 0 ? <p className="text-sm text-muted-foreground">Нет оценок за период.</p> : null}
        </>
      ) : null}
    </div>
  );
}
