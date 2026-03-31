"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import { DIARY_SYMPTOM_ENTRY_SAVED_EVENT } from "@/modules/diaries/symptomDiaryClientEvents";
import { DiaryStatsPeriodBar, type DiaryStatsPeriod } from "./DiaryStatsPeriodBar";

const RechartsSymptom = dynamic(() => import("./SymptomChartRecharts"), {
  ssr: false,
  loading: () => <div className="bg-muted/50 h-[260px] w-full animate-pulse rounded-md" />,
});

export type SymptomChartTrackingOption = { id: string; symptomTitle: string };

type ApiOk = {
  ok: true;
  points: { date: string; instant: number | null; daily: number | null }[];
  period: string;
  offset: number;
};

export function SymptomChart({ trackings }: { trackings: SymptomChartTrackingOption[] }) {
  const [trackingId, setTrackingId] = useState(trackings[0]?.id ?? "");
  const [period, setPeriod] = useState<DiaryStatsPeriod>("week");
  const [offset, setOffset] = useState(0);
  const [points, setPoints] = useState<
    { date: string; instant: number | null; daily: number | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (trackings.length === 0) {
      setTrackingId("");
      return;
    }
    if (!trackings.some((t) => t.id === trackingId)) {
      setTrackingId(trackings[0]!.id);
    }
  }, [trackings, trackingId]);

  const load = useCallback(async () => {
    if (!trackingId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        trackingId,
        period,
        offset: String(offset),
      });
      const res = await fetch(`/api/patient/diary/symptom-stats?${qs.toString()}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setError(res.status === 403 ? "Доступ запрещён" : "Требуется вход");
        setPoints([]);
        return;
      }
      if (!res.ok) {
        setError("Не удалось загрузить статистику");
        setPoints([]);
        return;
      }
      const data = (await res.json()) as ApiOk | { ok: false };
      if (!data.ok) {
        setError("Ошибка ответа");
        setPoints([]);
        return;
      }
      setPoints(
        data.points.map((p) => ({
          date: p.date,
          instant: p.instant,
          daily: p.daily,
        }))
      );
    } catch {
      setError("Сеть недоступна");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [trackingId, period, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onEntrySaved = () => {
      void load();
    };
    window.addEventListener(DIARY_SYMPTOM_ENTRY_SAVED_EVENT, onEntrySaved);
    return () => window.removeEventListener(DIARY_SYMPTOM_ENTRY_SAVED_EVENT, onEntrySaved);
  }, [load]);

  const showInitialSkeleton = loading && points.length === 0 && !error;
  const chartRefreshing = loading && points.length > 0 && !error;

  if (trackings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Нет отслеживаемых симптомов. Добавьте симптом выше.
      </p>
    );
  }

  return (
    <div id="patient-symptom-chart" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {trackings.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Симптом</span>
            <select
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[160px]"
              value={trackingId}
              onChange={(e) => {
                setTrackingId(e.target.value);
                setOffset(0);
              }}
            >
              {trackings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symptomTitle}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
      {showInitialSkeleton ? (
        <div className="bg-muted/50 h-[260px] w-full animate-pulse rounded-md" />
      ) : null}
      {!showInitialSkeleton && points.length === 0 && !error ? (
        <p className="text-muted-foreground text-sm">Нет записей за выбранный период.</p>
      ) : null}
      {!showInitialSkeleton && points.length > 0 && !error ? (
        <div
          className={`mt-6 ${chartRefreshing ? "opacity-60 transition-opacity" : ""}`}
          aria-busy={chartRefreshing}
        >
          <RechartsSymptom points={points} period={period} />
        </div>
      ) : null}

      {trackingId ? (
        <div className="mt-6">
          <Link
            href={`${routePaths.diarySymptomsJournal}?trackingId=${encodeURIComponent(trackingId)}&period=${period}&offset=${offset}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex text-xs")}
          >
            Открыть журнал
          </Link>
        </div>
      ) : null}
    </div>
  );
}
