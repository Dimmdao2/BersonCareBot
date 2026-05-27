"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminRegistrationStatsPayload, AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

import { AdminRegistrationLineChart } from "./AdminRegistrationLineChart";

function buildQuery(preset: AdminStatsTimePreset, from: string, to: string): string {
  const p = new URLSearchParams();
  p.set("preset", preset);
  if (preset === "custom") {
    p.set("from", from);
    p.set("to", to);
  }
  return `/api/admin/platform-user-registration-stats?${p.toString()}`;
}

function inclusiveCalendarDays(fromYmd: string, toYmd: string): number {
  const [yf, mf, df] = fromYmd.split("-").map((x) => Number.parseInt(x, 10));
  const [yt, mt, dt] = toYmd.split("-").map((x) => Number.parseInt(x, 10));
  const a = new Date(yf!, mf! - 1, df!);
  const b = new Date(yt!, mt! - 1, dt!);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatRegistrationError(code: string): string {
  if (code === "range_too_short") return "Выберите период не короче 7 дней.";
  return code;
}

export function AdminPlatformRegistrationStatsClient({ calendarTodayYmd }: { calendarTodayYmd: string }) {
  const [preset, setPreset] = useState<AdminStatsTimePreset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<AdminRegistrationStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (preset === "custom") {
        const from = customFrom.trim();
        const to = customTo.trim();
        if (from && to && inclusiveCalendarDays(from, to) < 7) {
          setData(null);
          setError(formatRegistrationError("range_too_short"));
          setLoading(false);
          return;
        }
      }
      const q = buildQuery(preset, customFrom.trim(), customTo.trim());
      const res = await fetch(q, { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminRegistrationStatsPayload>;
      if (!res.ok || !json.ok) {
        setData(null);
        const raw = json.error ?? `HTTP ${res.status}`;
        setError(formatRegistrationError(raw));
        return;
      }
      const { ok: _ok, ...rest } = json as { ok: true } & AdminRegistrationStatsPayload;
      setData(rest);
    } catch {
      setData(null);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (preset === "custom" && (!customFrom.trim() || !customTo.trim())) {
      const t = calendarTodayYmd.trim() || new Date().toISOString().slice(0, 10);
      setCustomFrom(ymdMinusDays(t, 6));
      setCustomTo(t);
      return;
    }
    void load();
  }, [preset, customFrom, customTo, load, calendarTodayYmd]);

  return (
    <section
      id="doctor-stats-admin-registrations-section"
      className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2>Регистрации и слияния</h2>
        {data ? <p className="text-muted-foreground text-sm">Календарь: {data.iana}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={preset === "week" ? "default" : "outline"}
          onClick={() => setPreset("week")}
        >
          7 дней
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preset === "month" ? "default" : "outline"}
          onClick={() => setPreset("month")}
        >
          30 дней
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preset === "custom" ? "default" : "outline"}
          onClick={() => setPreset("custom")}
        >
          Период
        </Button>
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            С
            <input
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            По
            <input
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          <Button type="button" size="sm" onClick={() => void load()}>
            Показать
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-muted-foreground text-sm" aria-busy="true">
          Загрузка…
        </p>
      ) : null}

      {data ? (
        <>
          <p className="text-muted-foreground text-sm">
            {data.fromDay === data.toDay ? `День ${data.fromDay}` : `Период ${data.fromDay} — ${data.toDay}`}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Новые аккаунты</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.newUsers}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Слияния</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.merges}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="text-muted-foreground text-xs">Всего событий</div>
              <div className="text-2xl font-semibold tabular-nums">{data.summary.combined}</div>
            </div>
          </div>
          {data.series.length > 0 ? <AdminRegistrationLineChart series={data.series} /> : null}
        </>
      ) : null}
    </section>
  );
}
