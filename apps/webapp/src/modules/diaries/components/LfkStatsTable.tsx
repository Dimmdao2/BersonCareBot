"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import { formatDiaryDayShortRu } from "@/modules/diaries/stats/formatDiaryDay";
import { DiaryStatsPeriodBar, type DiaryStatsPeriod } from "./DiaryStatsPeriodBar";

const RechartsLfk = dynamic(() => import("./DiaryLineChartRecharts"), {
  ssr: false,
  loading: () => <div className="bg-muted/50 h-[240px] w-full animate-pulse rounded-md" />,
});

export type LfkStatsComplexOption = { id: string; title: string };

type OverviewPayload = {
  ok: true;
  overview: { days: string[]; matrix: boolean[][] } | null;
  complexes: { id: string; title: string }[];
  detail: null;
  period: string;
  offset: number;
};

type DetailPayload = {
  ok: true;
  overview: null;
  detail: {
    complex: { id: string; title: string };
    chartPoints: { date: string; value: number }[];
    total: number;
  };
  complexes: { id: string; title: string }[];
  period: string;
  offset: number;
};

export function LfkStatsTable({ complexes }: { complexes: LfkStatsComplexOption[] }) {
  const [period, setPeriod] = useState<DiaryStatsPeriod>("week");
  const [offset, setOffset] = useState(0);
  const [detailComplexId, setDetailComplexId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewPayload["overview"]>(null);
  const [detail, setDetail] = useState<DetailPayload["detail"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        period,
        offset: String(offset),
      });
      if (detailComplexId) {
        qs.set("complexId", detailComplexId);
      }
      const res = await fetch(`/api/patient/diary/lfk-stats?${qs.toString()}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setError(res.status === 403 ? "Доступ запрещён" : "Требуется вход");
        return;
      }
      if (!res.ok) {
        setError("Не удалось загрузить статистику ЛФК");
        return;
      }
      const data = (await res.json()) as OverviewPayload | DetailPayload;
      if (!data.ok) {
        setError("Ошибка ответа");
        return;
      }
      if (data.detail) {
        setDetail(data.detail);
        setOverview(null);
      } else {
        setOverview(data.overview);
        setDetail(null);
      }
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  }, [period, offset, detailComplexId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showOverview = Boolean(!loading && !error && overview && detailComplexId === null);
  const showDetail = Boolean(!loading && !error && detail && detailComplexId);

  return (
    <div id="patient-lfk-stats-table" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Режим</span>
          <select
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[200px]"
            value={detailComplexId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setDetailComplexId(v === "" ? null : v);
              setOffset(0);
            }}
          >
            <option value="">Обзор по комплексам</option>
            {complexes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <DiaryStatsPeriodBar
          period={period}
          offset={offset}
          onPeriodChange={(p) => {
            setPeriod(p);
            setOffset(0);
          }}
          onOffsetChange={setOffset}
        />
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {loading ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Загрузка…
        </p>
      ) : null}

      {showOverview && overview ? (
        <div className="max-w-full overflow-x-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="border-border px-2 py-2 text-left font-medium">День</th>
                {complexes.map((c) => (
                  <th key={c.id} className="border-border max-w-[120px] px-2 py-2 text-center font-medium">
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.days.map((day, i) => (
                <tr key={day}>
                  <td className="border-border text-muted-foreground whitespace-nowrap px-2 py-1">
                    {formatDiaryDayShortRu(day)}
                  </td>
                  {complexes.map((c, j) => {
                    const done = overview.matrix[i]?.[j];
                    return (
                      <td key={c.id} className="border-border px-2 py-1 text-center">
                        <span aria-label={done ? "занятие отмечено" : "нет занятия"}>
                          {done ? "✓" : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showDetail && detail ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{detail.complex.title}</p>
          {detail.chartPoints.length === 0 ? (
            <p className="text-muted-foreground text-sm">Нет данных с оценками боли/сложности за выбранный период.</p>
          ) : (
            <div className="mt-6">
              <RechartsLfk points={detail.chartPoints} period={period} valueTooltipLabel="Боль / сложность" />
            </div>
          )}
          <div className="mt-6">
            <Link
              href={`${routePaths.diaryLfkJournal}?complexId=${encodeURIComponent(detail.complex.id)}&period=${period}&offset=${offset}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex text-xs")}
            >
              Открыть журнал
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
